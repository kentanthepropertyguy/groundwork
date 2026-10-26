import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Financial Experience V3: the five client journeys in a browser, desktop 1280 and phone 390, each from a fresh tab.
  1 one buyer: how much can I borrow?            2 a couple with their own incomes and loans
  3 affordability with cash, CPF and financing   4 a new-launch buyer who wants only the payment schedule
  5 an HDB upgrader selling after TOP (and selling first on What can I afford?)
  For each: the entries typed, the time from the last entry to the answer, that changing a figure updates it, that the phone keeps the answer on screen,
  and nothing sideways. No fixed waits: every step waits for what the page shows. Screenshots go to $FIN3_SHOTS when set.
  Run from the site folder: python3 tools/financial-tests/fin3-render.py"""
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('FIN3_SHOTS')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0
REPORT = []
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, i)
def page(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=''))
    return ctx, pg, errs
def until(pg, js, arg=None, t=8000):
    try: pg.wait_for_function(js, arg=arg, timeout=t); return True
    except Exception: return False
settled = "()=>window.__f3Settled&&window.__f3Settled()"
# FE V3.2: most entries sit behind an assumption chip; typ() opens the chip (and its Custom entries) when the field is not on screen, types, and closes it again
REVEAL = r'''k=>{const f=document.querySelector('[data-k="'+k+'"]');if(!f||(f.checkVisibility?f.checkVisibility():f.offsetParent))return false;const pn=f.closest('[data-chp]');if(pn&&window.__f3OpenChip)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false;const d=f.closest('details');if(d)d.open=true;return !!pn}'''
def close_chip(pg): pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)")
def typ(pg, k, v, n=0):
    opened = pg.evaluate(REVEAL, k); pg.locator(f'[data-k="{k}"]').nth(n).fill(v)
    if opened: close_chip(pg)
def pick(pg, chip, text):
    pg.click(f'[data-chip="{chip}"]'); pg.locator(f'[data-optl="{chip}"] .f3-opt', has_text=text).first.click()
def seg(pg, k, v): pg.evaluate("([k,v])=>{const b=[...document.querySelectorAll('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]')].find(x=>x.offsetParent)||document.querySelector('[data-k=\"'+k+'\"] button[data-v=\"'+v+'\"]'); b.click()}", [k, v])
def out(pg): return pg.inner_text('[data-out]')
def answer_after(pg, js):
    t0 = time.time(); good = until(pg, js); return good, round((time.time() - t0) * 1000)
def wide(pg): return pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
def shot(pg, name):
    if SHOTS: pg.screenshot(path=os.path.join(SHOTS, name + '.png'), full_page=False)
def bar_ok(pg, vn): return (vn != 'phone') or pg.evaluate("()=>{const c=document.querySelector('.f3-out').getBoundingClientRect();const inView=c.bottom>0&&c.top<innerHeight;return inView?!document.querySelector('[data-bar]').classList.contains('f3-bar-on'):document.querySelector('[data-bar]').classList.contains('f3-bar-on')}")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            # ---------------- 1. one buyer: how much can I borrow? (FE V3.2: the income alone; age 35 shown on its chip) ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-out]')
            check(vn + ' J1: before any entry the answer card shows what it will give (no blank panel)', 'type your income' in out(pg).lower() and 'bank may lend about' in out(pg).lower())
            typ(pg, 'p.0.fixed', '8,000')
            good, ms = answer_after(pg, "()=>/\\$921,000/.test(document.querySelector('[data-out]').textContent)")
            o = out(pg)
            check(vn + ' J1: one entry (income) gives the answer: about $921,000 over 30 years, age 35 assumed and said', good and '30 years' in o and 'age 35 assumed' in o and pg.inner_text('[data-chip="age"]') == 'Age 35', o[:200])
            check(vn + ' J1: with the $4,400 instalment and the home price the loan supports, in one sentence: what the loan supports at 75%, before savings, and the upfront', '$4,400' in o and '$1.22M' in o and 'Home price this loan supports' in o and 'What the loan supports at 75%, before your savings — about $338,000 upfront' in o, o[:400])
            check(vn + ' J1: the judgement names the limit and the lever: income, and each extra $1,000 adds about $115,000', 'Income is the limit here, not age. Each extra $1,000 a month, including a co-borrower’s, adds about $115,000.' in o, o[-300:])
            check(vn + ' J1: one Ask Ken on the page (the header’s)', pg.locator('main a:has-text("Ask Ken")').count() == 0)
            check(vn + ' J1: the phone bar stays away while the answer card is on screen', until(pg, '()=>window.__f3Settled()') and bar_ok(pg, vn) and ('921,000' in pg.evaluate("document.querySelector('[data-bar]').textContent") if vn == 'phone' else True))
            shot(pg, vn + '-J1-borrow')
            typ(pg, 'p.0.fixed', '9,000')
            check(vn + ' J1: changing the income updates it', until(pg, "()=>/\\$1,036,000/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:80])
            pg.click('[data-chip="age"]')
            check(vn + ' J1: the age chip opens straight to the age, typed exactly', until(pg, "()=>{const f=document.querySelector('[data-chp=\"age\"] [data-k=\"p.0.age\"]');return f&&f.offsetParent&&document.activeElement===f}"))
            pg.fill('[data-chp="age"] [data-k="p.0.age"]', '43'); pg.keyboard.press('Enter')
            check(vn + ' J1: a real age applies at once: 43 ends the loan by 65, over 22 years', until(pg, "()=>/over 22 years/i.test(document.querySelector('[data-out]').textContent)") and pg.inner_text('[data-chip="age"]') == 'Age 43' and not pg.is_visible('[data-chp="age"]'), out(pg)[:200])
            pg.click('[data-to-cost]'); pg.wait_for_url('**/payment-planner/**'); pg.wait_for_selector('[data-out]')
            check(vn + ' J1: “See what a … home costs me” opens the cost page with that price filled in', until(pg, "()=>document.querySelector('[data-k=\"price\"]').value!==''&&/Cash you’ll need/.test(document.querySelector('[data-out]').textContent)"), pg.input_value('[data-k="price"]'))
            REPORT.append((vn, 'J1 borrow, one buyer', 1, ms))
            check(vn + ' J1: no sideways scroll; no script errors', wide(pg) and not errs, errs)
            ctx.close()
            # ---------------- 2. a couple with their own incomes and loans ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector('[data-out]')   # V3.7: J2-J3 are a Plan My Move journey (standalone calculators share nothing: v37-render.py)
            pick(pg, 'n', 'Two of us')
            # V3.7 (Ken): the second person's income sits beside the first at the top, not inside the sheet; their age stays under Age
            check(vn + ' J2: “Two of us” puts the second person’s income at the top, beside the first, and closes the sheet', until(pg, "()=>{const f=document.querySelector('.f3-inc [data-k=\"p.1.fixed\"]');return f&&f.offsetParent&&!document.querySelector('[data-chp=\"n\"] [data-k=\"p.1.fixed\"]')}") and pg.is_hidden('[data-chp="n"]'))
            close_chip(pg)
            typ(pg, 'p.0.age', '36'); typ(pg, 'p.0.fixed', '8,000'); typ(pg, 'p.0.bonusYr', '12,000'); typ(pg, 'p.1.age', '33'); typ(pg, 'p.1.fixed', '6,000')
            pick(pg, 'loans', 'repaying loans')
            pg.locator('[data-chp="loans"] [data-loan="0"] [data-lk="type"]').select_option('car'); pg.fill('[data-chp="loans"] [data-loan="0"] [data-lk="amt"]', '600')
            pg.click('[data-chp="loans"] [data-add-loan]'); pg.locator('[data-chp="loans"] [data-loan="1"] [data-lk="type"]').select_option('other'); pg.locator('[data-chp="loans"] [data-loan="1"] [data-lk="who"]').select_option('1'); pg.fill('[data-chp="loans"] [data-loan="1"] [data-lk="amt"]', '300')
            good, ms = answer_after(pg, "()=>/after your \\$900 of loans/.test(document.querySelector('[data-out]').textContent)")
            why = pg.evaluate("()=>document.querySelector('[data-why-out]').textContent")
            check(vn + ' J2: each person’s income, bonus and loan; the $900 of repayments is counted and costed', good and '$900 a month you already pay lowers it by' in why, out(pg)[:300])
            check(vn + ' J2: and the joint age the bank uses', 'income-weighted age of 34.8' in why, why[:400])
            check(vn + ' J2: the loans chip says what is counted', pg.inner_text('[data-chip="loans"]') == '$900/mo of loans')
            shot(pg, vn + '-J2-couple')
            pg.click('[data-chp="loans"] [data-loan="1"] [data-del-loan]')
            check(vn + ' J2: removing a repayment updates it', until(pg, "()=>/after your \\$600 of loans/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:300])
            close_chip(pg)
            REPORT.append((vn, 'J2 borrow, couple with loans', 9, ms))
            check(vn + ' J2: no sideways scroll; no script errors', wide(pg) and not errs, errs)
            # ---------------- 3. affordability (V3.4: "What can I afford?" is the "Add my cash and CPF" row of How much can I borrow?; its old address opens it) ----------------
            pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ' J3 (Plan My Move, ?j=1): the people and loans carry over from How much can I borrow?, and the page says so', until(pg, "()=>document.querySelector('[data-k=\"p.1.age\"]').value==='33'") and pg.is_visible('[data-carry]') and pg.locator('[data-loan]').count() == 1)
            check(vn + ' J3: before cash and CPF it already shows what can be borrowed, with the row open', until(pg, "()=>/The bank may lend about/.test(document.querySelector('[data-out]').textContent)") and pg.evaluate("document.querySelector('[data-cashrow]').open"), out(pg)[:200])
            typ(pg, 'cash', '150,000'); typ(pg, 'cpf', '100,000')
            good, ms = answer_after(pg, "()=>/Your budget, about/.test(document.querySelector('[data-out]').textContent)&&document.querySelector('[data-max]')")
            o = out(pg)
            check(vn + ' J3: two more entries give the budget, the loan, the monthly instalment, the cash and what limits it', good and all(x in o for x in ['The bank may lend about', 'Monthly instalment', 'Cash you’ll need']) and re.search(r'(cash and CPF are the limit|The loan is the limit)', o) is not None, o[:300])
            shot(pg, vn + '-J3-afford')
            b1 = pg.inner_text('[data-max]'); typ(pg, 'cash', '250,000')
            check(vn + ' J3: more cash raises the budget', until(pg, "(b)=>document.querySelector('[data-max]')&&document.querySelector('[data-max]').textContent!==b", b1))
            # a price above it: What will this home cost me? hands the price back ("Check my own borrowing limit"), and the borrowing card says what that home needs
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]'); typ(pg, 'price', '3,000,000'); until(pg, settled)
            with pg.expect_navigation(): pg.click('.f3-opts [data-open-borrow]')
            pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ' J3: a price above it says how much more it needs than you may borrow', until(pg, "()=>/For the \\$3,000,000 home/.test(document.querySelector('[data-out]').textContent)&&/short/.test(document.querySelector('[data-out] [data-quote=\"over\"]')?document.querySelector('[data-out] [data-quote=\"over\"]').textContent:'')"), out(pg)[-300:])
            REPORT.append((vn, 'J3 afford (after J2, figures carried)', 2, ms))
            check(vn + ' J3: no sideways scroll; no script errors', wide(pg) and not errs, errs)
            ctx.close()
            # ---------------- 4. a new-launch buyer: what will it cost, and when is each payment due? ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-out]')
            typ(pg, 'price', '1,800,000')
            good, ms = answer_after(pg, "()=>/Cash you’ll need/.test(document.querySelector('[data-out]').textContent)&&/When you pay it/i.test(document.querySelector('[data-out]').textContent)&&/upfront payments/i.test(document.querySelector('[data-sched]').textContent)")
            check(vn + ' J4: after the price, only the card and closed rows: the schedule, option date, funding check and Ask Ken wait behind All payments', pg.is_hidden('[data-allpay]') and pg.is_hidden('[data-k="otp"]') and pg.is_hidden('[data-fund]') and pg.locator('main a:has-text("Ask Ken")').evaluate_all('l=>l.filter(a=>a.offsetParent).length') == 0)
            o = out(pg)
            check(vn + ' J4: one entry (the price) gives the cash needed first, CPF used, the instalment and the income needed', good and o.index('Cash you’ll need') < o.index('CPF used') < o.index('Monthly instalment') < o.index('Income needed') and '$509,600' in o and 'If you have it, CPF can pay up to $360,000 of this' in o, o[:400])
            check(vn + ' J4: the cash in all names the MAS minimum; stamp duty is qualified on its own row (usually cash first; CPF may reimburse eligible duty) (V3.7)', 'Includes the $90,000 minimum cash down payment' in o and 'MAS rule' in o and re.search(r'Buyer’s stamp duty\s+\$59,600\s+Within 14 days of signing the S&P · usually cash first; CPF may reimburse eligible duty', o) is not None, o[:1400])
            check(vn + ' J4: the judgement names the hurdle and says stamp duty is included', 'At this price the upfront sum is the usual hurdle, not the instalment. Stamp duty is included.' in o, o[-400:])
            check(vn + ' J4: the phone bar never covers the card', until(pg, '()=>window.__f3Settled()') and bar_ok(pg, vn))
            shot(pg, vn + '-J4-cost')
            pg.click('[data-to-sched]'); pg.fill('[data-k="otp"]', '2026-11-02')
            check(vn + ' J4: All payments opens the option date, the schedule and the funding check; with a date, the next payments and when they are due', until(pg, "()=>/2 Nov 2026/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:400])
            o = out(pg); sc = pg.inner_text('[data-sched]')
            check(vn + ' J4: … booking fee $90,000 on 2 Nov 2026, S&P $270,000, BSD $59,600, upfront $419,600, then the bank (V3.7: stages, stamp duty included)', 'Booking fee' in o and 'On 2 Nov 2026' in o and '$90,000' in o and 'At the S&P' in o and '$270,000' in o and 'Buyer’s stamp duty' in o and '$59,600' in o and 'Upfront, in all' in o and '$419,600' in o and 'The bank pays' in o, o[:900])
            check(vn + ' J4: then the schedule: upfront payments first, with their total', '$90,000' in sc and 'upfront payments' in sc.lower() and '$419,600' in sc, sc[:200])
            check(vn + ' J4: then the later milestones, in order, with no grand total', sc.upper().index('UPFRONT PAYMENTS') < sc.upper().index('DURING CONSTRUCTION') and 'Total to pay' not in pg.inner_text('body'))
            check(vn + ' J4: the funding check and comparisons stay closed and optional', not pg.locator('[data-fund]').evaluate('d=>d.open') and not pg.locator('[data-cmp]').evaluate('d=>d.open') and (pg.is_hidden('[data-scn]') or not pg.locator('[data-scn]').evaluate('d=>d.open')))
            typ(pg, 'price', '2,000,000'); typ(pg, 'loanAmt', '1,500,000'); typ(pg, 'ratePct', '3'); typ(pg, 'years', '30'); typ(pg, 'cpf', '300,000')
            check(vn + ' J4: $2M, $1.5M loan, 3% over 30 years, $300k CPF: $469,600 upfront first (V3.7), then $269,600 cash in all, CPF used $300,000, $6,324 a month, about $13,000 of income', until(pg, "()=>{const a=document.querySelector('[data-answer]');const t=document.querySelector('[data-out]').textContent;return a&&a.textContent==='$469,600'&&/Cash you’ll need[\\s\\S]{0,400}?\\$269,600/.test(t)&&/CPFused\\$300,000/.test(t.replace(/\\s/g,''))&&/\\$6,324/.test(t)&&/\\$13,000/.test(t)}"), out(pg)[:400])
            check(vn + ' J4: the chips show what is assumed', pg.inner_text('[data-chip="rate"]') == '3% · 30 years' and pg.inner_text('[data-chip="cpf"]') == 'CPF $300k' and pg.inner_text('[data-chip="loan"]') == 'Loan $1.5m', [pg.inner_text('[data-chip="rate"]'), pg.inner_text('[data-chip="cpf"]'), pg.inner_text('[data-chip="loan"]')])
            check(vn + ' J4: the age assumption is said, not hidden; below 4% the income is said to be tested at 4%', 'loan to 65' in out(pg) and 'tested at 4%' in out(pg), out(pg)[:500])
            if vn == 'phone':
                pg.evaluate("document.querySelector('[data-schsec]').scrollIntoView()")
                check(vn + ' J4: once the card has scrolled away, the bar shows the upfront sum, what follows and the monthly', until(pg, "()=>document.querySelector('[data-bar]').classList.contains('f3-bar-on')&&/\\$469,600/.test(document.querySelector('[data-bar]').textContent)&&/\\$6,324/.test(document.querySelector('[data-bar]').textContent)"))
                pg.evaluate('window.scrollTo(0,0)')
            check(vn + ' J4: the schedule reads “As construction progresses · earliest …”', '· earliest' in pg.inner_text('[data-sched]'))
            check(vn + ' J4: the schedule follows the new price', until(pg, "()=>/\\$100,000/.test(document.querySelector('[data-sched]').textContent)"))
            pg.click('[data-bd] summary')
            rc = pg.inner_text('[data-bd-out]')
            check(vn + ' J4: “Where the $569,600 goes” is a receipt with the combined upfront total: 5% cash, cash or CPF, stamp duty, upfront = cash + CPF, the loan', all(x in rc for x in ['Cash, at least', '$100,000', 'Cash or CPF', '$400,000', '$69,600', 'From you, cash and CPF', 'Cash $269,600 + CPF $300,000', '$569,600', '$1,500,000']), rc[:300])
            pg.click('[data-bd] summary')
            pg.click('[data-cmp] summary'); typ(pg, 'price2', '1,800,000')
            check(vn + ' J4: compare another price side by side (cash $209,600, $5,692 a month at $1.8M)', until(pg, "()=>/\\$209,600/.test((document.querySelector('[data-cmp-out]')||{}).textContent||'')&&/\\$5,692/.test(document.querySelector('[data-cmp-out]').textContent)"))
            pick(pg, 'who', 'Second home')
            check(vn + ' J4: “Second home” shows its ABSD before it is picked, applies it, and asks whether its loan is still being paid', until(pg, "()=>/ABSD 20%/.test(document.querySelector('[data-duty-line]').textContent)") and pg.is_visible('[data-optl="who"] .f3-og:has-text("Still paying a home loan")'), pg.inner_text('[data-optl="who"]')[:300])
            pg.locator('[data-optl="who"] .f3-opt', has_text='First home').first.click(); close_chip(pg)
            typ(pg, 'loanAmt', '1,700,000')
            check(vn + ' J4: a loan above 75% is flagged, not refused', until(pg, "()=>/Above the loan limit/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:300])
            pg.locator('[data-out]').scroll_into_view_if_needed(); shot(pg, vn + '-J4-cost-typed')
            pg.check('[data-k="noDate"]')
            check(vn + ' J4: no date yet: timings read from the option', until(pg, "()=>/option/.test(document.querySelector('[data-schsec]').textContent)&&/on the option/i.test(document.querySelector('[data-out]').textContent)"), pg.inner_text('[data-schsec]')[:200])
            REPORT.append((vn, 'J4 new launch: cost and schedule', 1, ms))
            check(vn + ' J4: no sideways scroll; no script errors', wide(pg) and not errs, errs)
            ctx.close()
            # ---------------- 5. an HDB upgrader: selling after TOP (payments), selling first (budget) ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]')
            typ(pg, 'price', '2,000,000'); pg.click('[data-to-sched]'); pg.fill('[data-k="otp"]', '2026-11-02')
            seg(pg, 'n', '2'); typ(pg, 'p.0.age', '40'); typ(pg, 'p.0.fixed', '9,000'); typ(pg, 'p.1.age', '38'); typ(pg, 'p.1.fixed', '7,000'); seg(pg, 'homes', '1')
            check(vn + ' J5: owning a home: the schedule carries ABSD (a second home) until it is sold', until(pg, "()=>/ABSD 20%/.test(document.querySelector('[data-duty-line]').textContent)"), pg.inner_text('[data-duty-line]'))
            typ(pg, 'cpf', '200,000'); pg.click('[data-fund] summary'); typ(pg, 'cash', '150,000')
            pick(pg, 'who', 'Yes, still paying'); pg.locator('[data-chp="who"] [data-loan="0"] [data-lk="type"]').select_option('home'); pg.fill('[data-chp="who"] [data-loan="0"] [data-lk="amt"]', '1,500'); close_chip(pg)
            seg(pg, 'order', 'buy')
            check(vn + ' J5: buying first starts at “Not decided yet”: no sale price, refund or date asked', until(pg, "()=>{const b=[...document.querySelectorAll('[data-k=\"saleWhen\"] button')].find(x=>x.dataset.v==='unsure');return b&&b.offsetParent&&b.getAttribute('aria-pressed')==='true'}") and not pg.is_visible('[data-k="sale.price"]'))
            if pg.is_visible('[data-k="cover95"]'):
                seg(pg, 'cover95', 'yes'); typ(pg, 'cpfBal.0.oa', '150,000'); typ(pg, 'cpfBal.0.sa', '100,000'); typ(pg, 'cpfBal.1.oa', '100,000'); typ(pg, 'cpfBal.1.sa', '90,000')
            check(vn + ' J5: not decided: the check says no sale money is counted', until(pg, "()=>/Sale date not decided/.test(document.querySelector('[data-fund-out]').textContent)"), pg.inner_text('[data-fund-out]')[:200])
            seg(pg, 'saleWhen', 'afterKeys'); typ(pg, 'saleAfter', '3'); typ(pg, 'sale.price', '700,000'); typ(pg, 'sale.loan', '100,000'); typ(pg, 'sale.cpfRefund', '250,000')
            good, ms = answer_after(pg, "()=>{const t=document.querySelector('[data-fund-out]').textContent;return /Sale of your flat completes/.test(t)&&!/isn’t counted/.test(t)&&/\\+\\$[1-9]/.test(t)}")
            fo = pg.inner_text('[data-fund-out]')
            check(vn + ' J5: after TOP: the sale money (cash and CPF) is counted, arriving 3 months after the keys, in the list in its place', good and 'What you need to prepare' in fo, fo[:200])
            check(vn + ' J5: the loan, the monthly mortgage as it builds up, and what to prepare are shown', 'Estimated bank loan' in fo and 'Monthly mortgage after' in fo)
            pg.locator('[data-fund-out]').scroll_into_view_if_needed(); shot(pg, vn + '-J5-pay-after-top')
            check(vn + ' J5: the comparison opens on request: selling first instead', pg.is_visible('[data-scn]'))
            pg.click('[data-scn] summary'); pg.locator('[data-sk="sale"]').select_option('sell')
            check(vn + ' J5: selling first instead is compared, with its ABSD', until(pg, "()=>/ABSD up front/.test((document.querySelector('[data-scn-out]')||{}).textContent||'')"))
            REPORT.append((vn, 'J5 upgrader, after TOP (payments)', 20, ms))
            # the same people on How much can I borrow?, with cash and CPF, selling first
            pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ' J5 (Plan My Move): the budget row opens with the same people, money, loan and home', until(pg, "()=>document.querySelector('[data-k=\"p.1.fixed\"]').value==='7,000'&&document.querySelector('[data-k=\"homes\"] [aria-pressed=\"true\"]').dataset.v==='1'"))
            good, ms = answer_after(pg, "()=>!!document.querySelector('[data-max]')")
            kept = pg.inner_text('[data-max]') if good else ''
            seg(pg, 'plan', 'sell'); typ(pg, 'sale.price', '700,000'); typ(pg, 'sale.loan', '100,000'); typ(pg, 'sale.cpfRefund', '250,000')
            check(vn + ' J5: selling first: the sale is counted and the budget rises', until(pg, "(k)=>{const m=document.querySelector('[data-max]');return m&&m.textContent!==k&&/Counts your home’s sale/.test(document.querySelector('[data-out]').textContent)}", kept), out(pg)[:300])
            shot(pg, vn + '-J5-afford-sell')
            check(vn + ' J5: no sideways scroll; no script errors', wide(pg) and not errs, errs)
            ctx.close()
            # ---------------- FE V3.3 acceptance: the cost page stays short; the borrowing judgement when age is the limit; printing ----------------
            if vn == 'phone':
                ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-out]')
                typ(pg, 'price', '2,000,000'); until(pg, "()=>/2,000,000/.test(document.querySelector('[data-out]').textContent)&&window.__f3Settled()"); pg.evaluate("document.activeElement.blur();window.scrollTo(0,0)")
                m = pg.evaluate("()=>({h:document.documentElement.scrollHeight,w:document.querySelector('main').innerText.split(/\\s+/).filter(x=>/[A-Za-z0-9$]/.test(x)).length,ask:[...document.querySelectorAll('a,button')].filter(a=>/Ask Ken/i.test(a.textContent)&&a.offsetParent&&getComputedStyle(a).visibility!=='hidden').length})")
                # V3.6 (Ken's audit, 26 Oct 2026): the main answer says what to prepare at each stage, which raised the V3.3 limits (1,600px, 150 words) to 1,900px and 210.
                # V3.7 (Ken, 27 Oct 2026): a new launch leads with the upfront sum and lists its stages in groups (booking; S&P and stamp duty, BSD and ABSD apart,
                # with the upfront subtotal; construction; the bank), each row with room for when and how it is paid. That is about 2,150px and 260 words at $2M
                # on a phone, so the limits are now 2,300px and 290 words. Tighten them again if the stage list is folded away.
                check('phone V3.3/V3.7: $2,000,000 and nothing tapped: under 2,300px tall, under 290 words in main, one Ask Ken', m['h'] < 2300 and m['w'] < 290 and m['ask'] == 1, m)
                REPORT.append(('phone', 'V3.3 cost page at $2M: height px / words', m['h'], m['w']))
                ctx.close()
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-out]')
            typ(pg, 'p.0.fixed', '20,000'); typ(pg, 'p.0.bonusYr', '50,000'); typ(pg, 'p.0.age', '48')
            check(vn + ' V3.3: $20,000 a month + $50,000 bonus a year, age 48, private, alone: about $1.86M over 17 years', until(pg, "()=>/\\$1,863,000/.test(document.querySelector('[data-out]').textContent)&&/Over 17 years/.test(document.querySelector('[data-out]').textContent)"), out(pg)[:200])
            o = out(pg)
            check(vn + ' V3.3: age is named as the limit; stretched to 75 about $2.49M at 55% with 10% cash: on a $4.5M home $2,025,000 upfront, at least $450,000 cash; the lever kept', 'Age is the limit here: a loan ending by 65 runs only 17 years. Stretched to age 75, it could be about $2,494,000, but banks then lend only 55% of the price and at least 10% must be cash: on a $4.5M home, $2,025,000 upfront, at least $450,000 of it in cash.' in o and 'Each extra $1,000 a month' in o, o[-500:])
            ctx.close()
            if vn == 'desktop':
                ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-out]')
                typ(pg, 'price', '2,000,000'); until(pg, "()=>window.__f3Settled()&&/Payment/.test(document.querySelector('[data-sched]').textContent)")
                pg.emulate_media(media='print')
                check(vn + ' V3.3: printing shows the schedule expanded, with no bar, chip lists or buttons', pg.evaluate("()=>getComputedStyle(document.querySelector('[data-allpay]')).display!=='none'&&getComputedStyle(document.querySelector('[data-bar]')).display==='none'&&getComputedStyle(document.querySelector('[data-to-sched]')).display==='none'"))
                pg.emulate_media(media='screen'); ctx.close()
            # ---------------- start fresh ----------------
            ctx, pg, errs = page(br, kw); pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector('[data-out]'); typ(pg, 'p.0.age', '35'); typ(pg, 'p.0.fixed', '8,000'); until(pg, settled)
            pg.goto(B + '/tools/planner/?j=1'); pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ' (Plan My Move): carried figures are visible and can be cleared in one step', pg.is_visible('[data-carry]'))
            pg.click('[data-fresh]'); pg.wait_for_selector('[data-f3="borrow"]')
            check(vn + ': after “Start fresh” nothing is carried', until(pg, "()=>document.querySelector('[data-k=\"p.0.age\"]').value===''") and not pg.is_visible('[data-carry]'))
            addr = pg.url.split('/', 3)[-1]   # the path and query only: the test server's random port can contain any digits
            check(vn + ': no address carries a figure', '35' not in addr and '8000' not in addr and '8,000' not in addr, addr)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('\nJourney | entries typed | ms from the last entry to the answer')
for r in REPORT: print('  %-8s %-44s %5s  %5s' % r)
if SHOTS:
    with open(os.path.join(SHOTS, 'journeys.json'), 'w') as f: json.dump(REPORT, f)
print('fin3-render: %d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
