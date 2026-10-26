import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Consolidated release (V3.5, 26 Oct 2026): the client scenarios Ken listed, as a buyer would meet them, desktop 1440 and phone 390.
Run from the site folder: python3 tools/financial-tests/client-scenarios-render.py
Each scenario checks the figures against the engine on the page (GW_FIN3 / GW_CALC) AND what the buyer reads: the words that stop a figure
being misread (estimate, provisional, private homes only, stamp duty included), and that nothing on a card reads NaN, undefined or a negative amount.
 1  First purchase            cost page and Borrow with cash and CPF: no ABSD, stamp duty included, budget equals the engine
 2  Second purchase           ABSD appears and is costed on the cost page and in the Borrow budget
 3  Joint borrowers           different incomes and ages: the loan equals GW_CALC.tdsr with both, over the income-weighted tenure
 4  HDB upgrade, sell first   the four steps carry, the budget equals GW_FIN3.afford, "estimate, not a bank approval"
    HDB upgrade, buy first    explained, with the engine's budget without the proceeds and ABSD named
 5  Owner aged 55+            Sell: provisional usable CPF ($0), joint share, CPF's own figure; the Upgrade budget falls accordingly
 6  Early repayment penalty   the proceeds fall by exactly the penalty; the Upgrade budget follows
 7  Adjusting the entries     price, loan, CPF, rate and income each move the right figure, and only that one
 8  Funds kept aside          none by default; six months and a custom amount recalculate; never deducted unasked
 9  HDB / EC on Borrow        the cash-and-CPF budget says private homes only
10  Bedroom Search            resale and new launch: confirmed matches listed, unconfirmed apart, wording names the evidence
11  Navigation                menu, the four calculators, old addresses
12  Save as PDF               every tool's sheet on one page, its first figure equal to the card's"""
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
    else: fail += 1; print('  FAIL', n, str(i)[:400])
money = lambda s: int(re.sub(r'[^0-9]', '', s.split('.')[0])) if s and re.search(r'\d', s) else None
def M(s):   # "$1.36M" or "$1,360,000" -> dollars
    m = re.search(r'\$([\d.,]+)\s*(M?)', s or '');
    return None if not m else (round(float(m.group(1).replace(',', '')) * 1e6) if m.group(2) else int(m.group(1).replace(',', '').split('.')[0]))
def settle(pg): pg.wait_for_function("()=>!window.__f3Settled||window.__f3Settled()"); pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.wait_for_timeout(250)
def fresh(pg, path): pg.goto(B + path); pg.wait_for_selector('[data-out]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]')
def fill(pg, k, v, keep=False):
    # the visible copy of a field; a field behind a chip is reached by opening its chip, which is closed again afterwards (keep=True leaves it open)
    f = pg.locator(f'[data-k="{k}"]:visible').first; opened = False
    if not f.count():
        opened = pg.evaluate("k=>{const f=document.querySelector('[data-k=\"'+k+'\"]');const pn=f&&f.closest('[data-chp]');if(pn)window.__f3OpenChip(pn.dataset.chp,k);const cu=f&&f.closest('[data-cust]');if(cu)cu.hidden=false;let d=f&&f.closest('details');while(d){d.open=true;d=d.parentElement.closest('details')}return !!pn}", k)
        f = pg.locator(f'[data-k="{k}"]:visible').first
    f.wait_for(state='visible', timeout=8000); f.fill(v)
    if opened and not keep: close(pg)
def seg(pg, k, v): pg.evaluate("([k,v])=>{const b=[...document.querySelectorAll('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]')].find(x=>x.offsetParent)||document.querySelector('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]'); b.click()}", [k, v])
def close(pg): pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)")
def out(pg): return pg.inner_text('[data-out]')
def clean(tag, name, t): check(f'{tag} {name}: the card reads cleanly (no NaN, undefined, null or negative amount)', not re.search(r'NaN|undefined|null|\$-|−\$\d', t), t[:300])
def opt(pg, chip, text): pg.evaluate("k=>window.__f3OpenChip(k)", chip); pg.wait_for_timeout(150); pg.locator(f'[data-optl="{chip}"] .f3-opt', has_text=text).first.click(); settle(pg)
def sheet(pg): return pg.evaluate("()=>{const h=GW_SHEET.mount(window.__f3Sheet());const m=h.querySelector('.gs-main');const r={fits:m.scrollHeight<=m.clientHeight+1,f1:(h.querySelector('.gs-figs [data-sheet-fig]')||{}).textContent,basis:h.querySelector('[data-sheet-basis]').textContent,txt:h.textContent};GW_SHEET.unmount();return r}")
def upgrade(pg, price='750,000', loan='250,000', cpf='205,000', inc='8,000', age='35'):
    fresh(pg, '/tools/hdb-upgrade/')
    fill(pg, 'sale.price', price); pg.click('[data-stdone="worth"]'); settle(pg)
    fill(pg, 'sale.loan', loan); fill(pg, 'sale.cpfRefund', cpf); pg.click('[data-stdone="sell"]'); settle(pg)
    fill(pg, 'p.0.fixed', inc); fill(pg, 'p.0.age', age); pg.click('[data-stdone="borrow"]'); settle(pg)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        print('--', tag)
        # ---- 1. first purchase ----
        fresh(pg, '/tools/payment-planner/'); fill(pg, 'price', '1,500,000'); settle(pg); t = out(pg)
        eng = pg.evaluate("()=>{const c=GW_FIN3.cost({n:1,p:[{res:'SC'},{}],loans:[],pkind:'new',price:1500000,homes:0,ratePct:null,years:null,cpf:null,loanAmt:null});return {cash:c.cash,duty:c.duty,absd:c.absd,monthly:c.monthly}}")
        check(f'{tag} first purchase: cost page cash equals the engine, stamp duty named, no ABSD', money(pg.inner_text('[data-answer]')) == round(eng['cash']) and 'stamp duty' in t and 'ABSD' not in t and eng['absd'] == 0, [t[:200], eng])
        clean(tag, 'first purchase cost', t)
        fresh(pg, '/tools/tdsr/'); fill(pg, 'p.0.fixed', '8,000'); settle(pg); pg.click('[data-cashrow] > summary'); fill(pg, 'cash', '150,000'); fill(pg, 'cpf', '100,000'); settle(pg); t = out(pg)
        eng = pg.evaluate("()=>{const a=GW_FIN3.afford({n:1,p:[{age:35,fixed:8000,res:'SC'},{}],loans:[],cash:150000,cpf:100000,homes:0,plan:'keep',akind:'new',bkind:'private',sale:{},cpfBal:[{},{}],ratePct:null,years:null});return {b:a.budget,lim:a.limitedBy}}")
        check(f'{tag} first purchase: Borrow budget equals the engine (age 35 assumed and said)', money(pg.inner_text('[data-budget]')) == int(eng['b'] // 1000 * 1000) and 'age 35 assumed' in t, [t[:250], eng])
        check(f'{tag} first purchase: the budget says stamp duty is included and which limit binds', 'stamp duty included' in t and ('cash and CPF are the limit' in t or 'loan is the limit' in t))
        clean(tag, 'first purchase borrow', t)
        # ---- 2. second purchase ----
        fresh(pg, '/tools/payment-planner/'); fill(pg, 'price', '1,500,000'); settle(pg); c1 = money(pg.inner_text('[data-answer]'))
        opt(pg, 'who', 'Second home'); close(pg); settle(pg); t = out(pg); c2 = money(pg.inner_text('[data-answer]'))
        check(f'{tag} second purchase: ABSD 20% is named and added to the cash ($300,000 on $1.5M)', 'ABSD' in t and c2 - c1 == 300000, [c1, c2, t[:200]])
        fresh(pg, '/tools/tdsr/'); fill(pg, 'p.0.fixed', '15,000'); fill(pg, 'p.0.age', '45'); settle(pg); pg.click('[data-cashrow] > summary'); fill(pg, 'cash', '700,000'); fill(pg, 'cpf', '0')
        pg.click('[data-dutywho] > summary'); seg(pg, 'homes', '1'); seg(pg, 'plan', 'keep'); settle(pg); t = out(pg)
        check(f'{tag} second purchase: the Borrow budget includes the ABSD and says so', '(ABSD $' in t, t[:300])
        # ---- 3. joint borrowers, different incomes ----
        fresh(pg, '/tools/tdsr/'); fill(pg, 'p.0.fixed', '12,000'); fill(pg, 'p.0.age', '40'); opt(pg, 'n', 'Two of us'); fill(pg, 'p.1.fixed', '4,000', keep=True); fill(pg, 'p.1.age', '30'); close(pg); settle(pg); t = out(pg)
        eng = pg.evaluate("()=>{const r=GW_CALC.tdsr({kind:'private',borrowers:[{age:40,fixed:12000,variable:0},{age:30,fixed:4000,variable:0}],debts:0,loans:0});return {l:r.maxLoan,y:r.tenure.years,age:r.B.iwaaUse}}")
        check(f'{tag} joint borrowers: the loan and tenure equal GW_CALC.tdsr for both, at the income-weighted age', money(pg.inner_text('[data-cap]')) == int(eng['l'] // 1000 * 1000) and f"Over {eng['y']} years" in t and 'between you' in t.lower(), [t[:200], eng])
        # ---- 4. HDB upgrade, sell first and buy first ----
        upgrade(pg); t = out(pg)
        eng = pg.evaluate("()=>{const a=GW_FIN3.afford({n:1,p:[{age:35,fixed:8000,res:'SC'},{}],loans:[],cash:0,cpf:0,homes:1,plan:'sell',whose:'both',akind:'new',bkind:'private',sale:{type:'hdb',price:750000,loan:250000,cpfRefund:205000},cpfBal:[{},{}],ratePct:null,years:null});return a.budget}")
        b0 = M(pg.inner_text('[data-budget]'))
        check(f'{tag} upgrade, sell first: the budget equals GW_FIN3.afford for the same figures (shown to $10,000)', abs(b0 - eng) < 10000, [b0, eng])
        check(f'{tag} upgrade: the card says it is an estimate, not a bank approval, and names the KPT assumptions', 'not a bank approval' in t and 'KPT assumptions' in t)
        pg.click('[data-bfirst] > summary'); bf = pg.inner_text('[data-bfirst-out]')
        check(f'{tag} upgrade, buy first: explained with ABSD and the budget without the proceeds', 'ABSD' in bf and 'without the proceeds' in bf, bf[:200])
        clean(tag, 'upgrade', t)
        # ---- 5. owner aged 55+ ----
        fresh(pg, '/tools/sale-proceeds/'); fill(pg, 'sale.price', '750,000'); fill(pg, 'sale.loan', '250,000'); fill(pg, 'sale.cpfRefund', '205,000', keep=True); seg(pg, 'sale.o55', 'yes'); close(pg); settle(pg); t = out(pg)
        check(f'{tag} 55+: the usable CPF is $0 and marked provisional until CPF’s figure is given; the refund itself still shows', money(pg.inner_text('[data-cpfuse]')) == 0 and 'provisional' in t and money(pg.inner_text('[data-cpf]')) == 205000, t[:300])
        fill(pg, 'sale.cpf55', '120,000'); close(pg); settle(pg)
        check(f'{tag} 55+ joint owners: the younger owners’ part ($85,000) counts in full', money(pg.inner_text('[data-cpfuse]')) == 85000)
        fill(pg, 'sale.cpfUse', '50,000'); close(pg); settle(pg); t = out(pg)
        check(f'{tag} 55+ with CPF’s figure: $85,000 + $50,000 usable, no longer provisional', money(pg.inner_text('[data-cpfuse]')) == 135000 and 'provisional' not in t, t[:300])
        upgrade(pg); bN = M(pg.inner_text('[data-budget]'))
        pg.click('[data-stc="sell"]'); seg(pg, 'sale.o55', 'yes'); pg.click('[data-stdone="sell"]'); settle(pg); t = out(pg); b55 = M(pg.inner_text('[data-budget]'))
        check(f'{tag} 55+ in the upgrade: the budget falls when the CPF refund is not yet usable, and says it is provisional', b55 < bN and 'provisional' in t, [bN, b55, t[:250]])
        # ---- 6. early repayment penalty ----
        fresh(pg, '/tools/sale-proceeds/'); fill(pg, 'sale.price', '750,000'); fill(pg, 'sale.loan', '250,000'); settle(pg); s0 = money(pg.inner_text('[data-total]'))
        pg.click('[data-pen] > summary'); fill(pg, 'sale.penalty', '4,000'); settle(pg); t = out(pg); s1 = money(pg.inner_text('[data-total]'))
        check(f'{tag} penalty: the proceeds fall by exactly the penalty, and the card names it', s0 - s1 == 4000 and '$4,000 repayment penalty' in t, [s0, s1])
        upgrade(pg); u0 = M(pg.inner_text('[data-budget]')); pg.click('[data-stc="sell"]'); pg.click('[data-pen] > summary'); fill(pg, 'sale.penalty', '20,000'); pg.click('[data-stdone="sell"]'); settle(pg); u1 = M(pg.inner_text('[data-budget]'))
        check(f'{tag} penalty in the upgrade: the budget falls', u1 < u0, [u0, u1])
        # ---- 7. adjusting the entries ----
        fresh(pg, '/tools/payment-planner/'); fill(pg, 'price', '2,000,000'); settle(pg)
        g = lambda: {'cash': money(pg.inner_text('[data-answer]')), 'mo': money(pg.inner_text('[data-out] .f3-ar:nth-of-type(3) .f3-af') or '') if False else None, 't': out(pg)}
        c0 = money(pg.inner_text('[data-answer]')); fill(pg, 'price', '2,200,000'); settle(pg); c1 = money(pg.inner_text('[data-answer]'))
        check(f'{tag} adjust price: the cash rises with the price', c1 > c0, [c0, c1])
        opt(pg, 'loan', '70%'); t = out(pg); c2 = money(pg.inner_text('[data-answer]'))
        check(f'{tag} adjust loan: a smaller loan needs more cash', c2 > c1 and '$1,540,000 loan' in t, [c1, c2])
        opt(pg, 'cpf', '$300,000'); c3 = money(pg.inner_text('[data-answer]'))
        check(f'{tag} adjust CPF: $300,000 of CPF lowers the cash by $300,000', c2 - c3 == 300000, [c2, c3])
        mo0 = re.search(r'Monthly instalment\s*On a [^\n]*\n?\s*\$([\d,]+)', out(pg)); opt(pg, 'rate', '3%'); t = out(pg)
        check(f'{tag} adjust rate: below 4%, income needed says it is tested at 4%', 'tested at 4%' in t, t[:300])
        fresh(pg, '/tools/tdsr/'); fill(pg, 'p.0.fixed', '8,000'); settle(pg); l0 = money(pg.inner_text('[data-cap]')); fill(pg, 'p.0.fixed', '9,000'); settle(pg); l1 = money(pg.inner_text('[data-cap]'))
        check(f'{tag} adjust income: the loan rises with income', l1 > l0, [l0, l1])
        # ---- 8. funds kept aside ----
        upgrade(pg); t = out(pg)
        check(f'{tag} funds aside: none by default, nothing deducted unasked', 'Keep funds aside: None' in pg.inner_text('[data-chip="ures"]') and money(pg.inner_text('[data-reserve]')) == 0)
        b0 = M(pg.inner_text('[data-budget]')); opt(pg, 'ures', 'Six months'); b6 = M(pg.inner_text('[data-budget]')); r6 = money(pg.inner_text('[data-reserve]'))
        check(f'{tag} funds aside: six months of the instalment is a choice that lowers the budget', b6 < b0 and r6 > 0 and 'Keep funds aside: $' in pg.inner_text('[data-chip="ures"]'), [b0, b6, r6])
        opt(pg, 'ures', 'None'); check(f'{tag} funds aside: back to none restores the budget', M(pg.inner_text('[data-budget]')) == b0)
        # ---- 9. HDB / EC on Borrow ----
        fresh(pg, '/tools/tdsr/#hdb'); fill(pg, 'p.0.fixed', '6,000'); settle(pg)
        check(f'{tag} HDB on Borrow: the cash-and-CPF row says private homes only', 'private homes only' in pg.inner_text('[data-cashrow] > summary'))
        pg.click('[data-cashrow] > summary'); check(f'{tag} HDB on Borrow: opened, it explains and points to the cost page', 'private homes only' in pg.inner_text('[data-cash-hdbec]') and pg.is_visible('[data-cash-hdbec] a'))
        opt(pg, 'bkind', 'New EC'); check(f'{tag} EC on Borrow: the same explanation', 'private homes only' in pg.inner_text('[data-cashrow] > summary'))
        # ---- 10. Bedroom Search, resale and new launch ----
        pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_function("()=>document.querySelector('#kdForm input, #kdForm [data-k]')", timeout=20000)
        has_beds = pg.evaluate("()=>!!(window.KPD_CFG&&KPD_CFG.BEDS_URL)")
        check(f'{tag} Bedroom Search: the page asks for the bedroom data', has_beds)
        # ---- 11. navigation ----
        pg.goto(B + '/tools/'); t = pg.inner_text('main')
        check(f'{tag} navigation: the Calculators page lists the four questions', all(x in t for x in ['What will this home cost me?', 'How much can I borrow?', 'What will I get from selling?', 'Upgrade from HDB']))
        for old, want in (('/tools/planner/', '/tools/tdsr/'), ('/tools/msr/', '/tools/tdsr/')):
            pg.goto(B + old); pg.wait_for_url(re.compile('.*' + re.escape(want) + '.*'), timeout=8000); check(f'{tag} navigation: {old} opens {want}', want in pg.url)
        # ---- 12. Save as PDF on every tool, with the scenario figures ----
        for path, setup in (('/tools/payment-planner/', lambda: (fill(pg, 'price', '2,000,000'), settle(pg))), ('/tools/tdsr/', lambda: (fill(pg, 'p.0.fixed', '8,000'), settle(pg))),
                            ('/tools/sale-proceeds/', lambda: (fill(pg, 'sale.price', '750,000'), fill(pg, 'sale.loan', '250,000'), pg.click('[data-pen] > summary'), fill(pg, 'sale.penalty', '4,000'), fill(pg, 'sale.cpfRefund', '205,000', keep=True), seg(pg, 'sale.o55', 'yes'), close(pg), settle(pg)))):
            fresh(pg, path); setup(); sh = sheet(pg); card1 = pg.inner_text('[data-out] .f3-ar1 .f3-af')
            check(f'{tag} PDF {path}: one A4 page; its first figure is the card’s', sh['fits'] and money(sh['f1']) == money(card1), [sh['f1'], card1])
            if 'sale' in path: check(f'{tag} PDF sell: the basis names the penalty and the 55+ owner; the sheet says provisional', 'penalty' in sh['basis'] and '55 or older' in sh['basis'] and 'rovisional' in sh['txt'])
        upgrade(pg); sh = sheet(pg); check(f'{tag} PDF upgrade: one A4 page, the budget as on the card, "not a bank approval"', sh['fits'] and sh['f1'].replace('S', '') == pg.inner_text('[data-budget]') and 'not a bank approval' in sh['txt'], [sh['f1'], pg.inner_text('[data-budget]')])
        check(f'{tag}: no script errors', not errs, errs[:3]); ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'\nclient-scenarios-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
