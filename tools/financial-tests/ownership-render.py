import os, pathlib, re, socket, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
"""V3.12 Stage 1 (Ken, 27 Oct 2026): How much can I borrow? per borrower, and the existing homes one by one on What will this home cost me?
Every figure is checked against the calculators' own engines (GW_FIN3, GW_CALC) given the same answers, so Stage 1 changes no figure; the scenarios Ken asked for:
  one borrower; two borrowers; a separate home each; a loan held jointly; plus mixed ownership and a second buyer not taking the loan.
Desktop and phone. Run from the site folder: python3 tools/financial-tests/ownership-render.py"""
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
    else: fail += 1; print('  FAIL', n, str(i)[:500])
amt = lambda s: int(re.sub(r'[^0-9]', '', s)) if s and re.search(r'\d', s) else None
def settle(pg): pg.wait_for_function('window.__f3Settled && window.__f3Settled()', timeout=15000); pg.wait_for_timeout(150)
def fresh(pg, path): pg.goto(B + path); pg.wait_for_selector('[data-out]'); pg.evaluate('sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('[data-out]'); settle(pg)
def seg(pg, k, v): pg.click(f'[data-k="{k}"] [data-v="{v}"] >> visible=true')
def out(pg): return pg.inner_text('[data-out]')
def figs(pg): return pg.evaluate("()=>[...document.querySelectorAll('[data-out] .f3-ar .f3-af')].map(x=>x.textContent.trim())")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
            # ================= How much can I borrow? =================
            fresh(pg, '/tools/tdsr/')
            body = pg.inner_text('main')
            check(vn + ': no home ownership or sale workflow on the borrowing page (no Whose?, Selling it?, sale price, loan left or CPF refund)', pg.locator('[data-k="whose"],[data-k="plan"],[data-k="homes"],[data-k="sale.price"],[data-k="sale.loan"],[data-k="sale.cpfRefund"]').count() == 0 and 'Selling it?' not in body and 'Whose?' not in body)
            check(vn + ': Sale proceeds is one link away for anyone selling', pg.is_visible('a[href="../sale-proceeds/"]') and 'Selling a property?' in pg.inner_text('.f3-sp'))
            # 1. one borrower: the quick answer from the income alone, advanced details optional
            pg.fill('[data-inc] [data-k="p.0.fixed"]', '8,000'); settle(pg)
            e1 = pg.evaluate("()=>GW_FIN3.borrow({n:1,p:[{fixed:8000},{}],loans:[],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' one borrower: the loan appears from the income alone, equal to the engine', abs(amt(pg.inner_text('[data-cap]')) - e1['maxLoan']) < 1000, [pg.inner_text('[data-cap]'), e1['maxLoan']])
            check(vn + ' one borrower: one card ("You"), with income, other monthly debts and housing loans', pg.locator('.f3-bpc:visible').count() == 1 and 'YOU' in pg.inner_text('.f3-bpc:visible').upper() and pg.is_visible('[data-k="p.0.debts"]') and pg.is_visible('[data-k="p.0.hl"]'))
            seg(pg, 'p.0.hl', '1'); settle(pg)
            check(vn + ' a housing loan with no repayment: asked for, and no loan figure is shown meanwhile', 'Add the monthly repayment' in out(pg) and pg.locator('[data-cap]').count() == 0, out(pg)[:200])
            pg.fill('[data-k="p.0.hlAmt"]', '1,200'); pg.fill('[data-k="p.0.debts"]', '500'); settle(pg)
            e1b = pg.evaluate("()=>GW_FIN3.borrow({n:1,p:[{fixed:8000},{}],loans:[{type:'home',who:0,amt:1200},{type:'other',who:0,amt:500}],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' one borrower with a $1,200 housing loan and $500 of other debts: the engine’s figure, 45%, $1,700 counted', abs(amt(pg.inner_text('[data-cap]')) - e1b['maxLoan']) < 1000 and 'after your $1,700 of loans' in out(pg) and 'covers only 45%' in out(pg) and e1b['ltv'] == 0.45, [pg.inner_text('[data-cap]'), e1b['maxLoan'], e1b['ltv']])
            # 2. two borrowers, a separate housing loan each: V3.12 Stage 2 (Ken, 28 Oct): 35% by default until banks confirm; one line says 45% may apply
            seg(pg, 'n', '2'); pg.fill('[data-inc] [data-k="p.1.fixed"]', '7,000'); pg.fill('[data-k="p.0.debts"]', ''); settle(pg)
            seg(pg, 'p.1.hl', '1'); pg.fill('[data-k="p.1.hlAmt"]', '900'); settle(pg)
            e2 = pg.evaluate("()=>GW_FIN3.borrow({n:2,p:[{fixed:8000},{fixed:7000}],loans:[{type:'home',who:0,amt:1200},{type:'home',who:1,amt:900}],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' Stage 2 L4: two borrowers, a separate housing loan each: 35% by default (as Stage 1), both repayments counted once ($2,100), the engine’s loan', abs(amt(pg.inner_text('[data-cap]')) - e2['maxLoan']) < 1000 and 'after your $2,100 of loans' in out(pg) and e2['ltv'] == 0.35 and e2['altLtv'] == 0.45 and 'covers only 35%' in out(pg) and 'Not a budget' in out(pg), [pg.inner_text('[data-cap]'), e2])
            check(vn + ' Stage 2 L4: one short line: 45% may apply if the bank counts each borrower’s own loans; the bank confirms (no control, no box)', pg.locator('[data-out] [data-ltv-alt]').count() == 1 and pg.inner_text('[data-ltv-alt]').strip() == '45% may apply if your bank counts each borrower’s own housing loans. Your bank confirms the limit.' and pg.locator('[data-out] .f3-alert').count() == 0, out(pg)[:500])
            pg.click('[data-why] summary'); pg.wait_for_timeout(150)
            check(vn + ' Stage 2 L4: “How it is worked out” gives both readings and says the bank confirms', 'Loan limit: 35% of the price, counting both of your housing loans. If your bank counts each borrower’s own loans (one each), it may be 45%.' in pg.inner_text('[data-why-out]') and 'Your bank confirms the limit' in pg.inner_text('[data-why-out]'))
            pg.click('[data-why] summary')
            # Person 1 with two loans (2+): 35%, as before; the 35% price line is still not a budget (Ken's Stage 1 review)
            seg(pg, 'p.0.hl', '2'); settle(pg)
            e2b = pg.evaluate("()=>GW_FIN3.borrow({n:2,p:[{fixed:8000},{fixed:7000}],loans:[{type:'home',who:0,amt:600},{type:'home',who:0,amt:600},{type:'home',who:1,amt:900}],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' Stage 2: Person 1 with two loans (2+), Person 2 one: 35%, as before; no “each one” wording', e2b['ltv'] == 0.35 and 'covers only 35%' in out(pg) and pg.locator('[data-ltv-alt]').count() == 0, out(pg)[:300])
            pr = pg.evaluate("()=>{const r=[...document.querySelectorAll('[data-out] .f3-ar')].find(x=>/could support/.test(x.textContent));return r?r.textContent:''}")
            check(vn + ' Ken’s review: the price a 35% loan could support is not read as a budget: labelled “could support”, its large upfront first, “Not a budget”, ABSD may add more', 'Home price this loan could support' in pr and re.search(r'Needs about \$[\d.,]+M? upfront', pr) is not None and 'covers only 35%' in pr and 'Not a budget' in pr and 'ABSD may add more' in pr, pr)
            seg(pg, 'p.0.hl', '1'); settle(pg)
            box = pg.evaluate("()=>[...document.querySelectorAll('.f3-bpc')].map(c=>{const r=c.getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})")
            check(vn + ' two borrowers: Person 1 and Person 2 ' + ('side by side' if vn == 'desktop' else 'stacked'), (box[0][1] == box[1][1] and box[1][0] > box[0][0]) if vn == 'desktop' else (box[0][0] == box[1][0] and box[1][1] > box[0][1]), box)
            # 3. a loan held jointly: entered once, counted once
            seg(pg, 'p.0.hl', '0'); seg(pg, 'p.1.hl', '0'); seg(pg, 'jl', '1'); pg.fill('[data-k="jlAmt"]', '1,500'); settle(pg)
            e3 = pg.evaluate("()=>GW_FIN3.borrow({n:2,p:[{fixed:8000},{fixed:7000}],loans:[{type:'home',who:0,amt:1500}],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' a housing loan in both names: one loan (45%), its $1,500 counted once, not once for each borrower', abs(amt(pg.inner_text('[data-cap]')) - e3['maxLoan']) < 1000 and 'after your $1,500 of loans' in out(pg) and e3['ltv'] == 0.45, [pg.inner_text('[data-cap]'), e3])
            # the budget: needs the properties each owns (stamp duty), never assumed
            pg.click('[data-cashrow] > summary'); pg.fill('[data-k="cash"]', '300,000'); pg.fill('[data-k="cpf"]', '150,000'); settle(pg)
            check(vn + ' budget: with cash and CPF but no ownership answer, no budget and first-home ABSD is not assumed; the page asks', pg.locator('[data-budget]').count() == 0 and pg.is_visible('[data-own-need]') and 'needed for a budget' in pg.inner_text('[data-dutywho-sum]'))
            seg(pg, 'p.0.own', '1'); seg(pg, 'p.1.own', '1'); settle(pg)
            check(vn + ' budget: both own one: asked whether one is owned together (separate and joint differ for the budget)', pg.is_visible('[data-k="ownTog"]') and pg.locator('[data-budget]').count() == 0)
            seg(pg, 'ownTog', 'no'); settle(pg)
            if pg.is_visible('[data-k="cover95"]'):
                seg(pg, 'cover95', 'yes'); pg.fill('[data-k="cpfBal.0.oa"]', '150,000'); pg.fill('[data-k="cpfBal.0.sa"]', '100,000'); pg.fill('[data-k="cpfBal.1.oa"]', '120,000'); pg.fill('[data-k="cpfBal.1.sa"]', '90,000'); settle(pg)
            ea = pg.evaluate("()=>{const a=GW_FIN3.afford({n:2,p:[{age:35,fixed:8000,res:'SC'},{age:35,fixed:7000,res:'SC'}],loans:[{type:'home',who:0,amt:1500}],cash:300000,cpf:150000,homes:1,whose:'both',owned:[1,1],homeJoint:false,plan:'keep',akind:'new',bkind:'private',sale:{},cpfBal:[{oa:150000,sa:100000},{oa:120000,sa:90000}],cover95:true,ratePct:null,years:null});return {s:a.state,b:a.budget,absd:a.top&&a.top.absd}}")
            got = amt(pg.inner_text('[data-budget]')) if pg.locator('[data-budget]').count() else None
            check(vn + ' budget: a property each, owned separately: the engine’s budget, with second-home ABSD in the cash', ea['s'] == 'ok' and got is not None and abs(got - ea['b']) < 1000 and '(ABSD $' in out(pg), [got, ea, out(pg)[:300]])
            check(vn + ' borrowing page: no sideways scroll; no script errors', pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1') and not errs, errs)
            # ================= What will this home cost me? existing homes =================
            fresh(pg, '/tools/payment-planner/'); pg.fill('[data-k="price"] >> nth=0', '1,800,000'); settle(pg)
            pg.click('[data-chip="who"]'); pg.locator('[data-optl="who"] .f3-opt', has_text='Two buyers').first.click(); settle(pg)
            if not pg.is_visible('[data-chp="who"]'): pg.click('[data-chip="who"]')
            check(vn + ': no global None / One / Two or more, and no Whose? on the page', pg.locator('[data-k="homes"],[data-k="whose"]').count() == 0)
            seg(pg, 'ownAny', 'yes'); settle(pg)
            check(vn + ': “Yes” adds Existing home 1 with its owner, kind, Keeping or Selling and the loan question', pg.is_visible('[data-home="0"]') and all(pg.locator(f'[data-home="0"] [data-hk="{f}"]').count() for f in ('own', 'type', 'act', 'mort')))
            duty = lambda: pg.inner_text('[data-duty-line]') if pg.locator('[data-duty-line]').count() else out(pg)
            def absd_of(owned, joint=None, order='none', sold=None):
                return pg.evaluate("a=>{const s={n:2,p:[{res:'SC'},{res:'SC'}],loans:[],pkind:'new',price:1800000,homes:Math.max(...a.o),owned:a.o,order:a.order,soldOwners:a.sold};if(a.j!==null)s.homeJoint=a.j;return GW_FIN3.cost(s).absd}", {'o': owned, 'j': joint, 'order': order, 'sold': sold})
            # 4. two separate properties
            pg.click('[data-home="0"] [data-hk="own"][data-v="0"]'); pg.click('[data-home="0"] [data-hk="mort"][data-v="no"]'); pg.click('[data-chp="who"] [data-add-home]'); settle(pg)
            pg.click('[data-home="1"] [data-hk="own"][data-v="1"]'); pg.click('[data-home="1"] [data-hk="mort"][data-v="no"]'); settle(pg)
            check(vn + ' two separate properties (one each): each owns one, ABSD 20% ($360,000), as the engine gives', '$360,000' in out(pg) and absd_of([1, 1], False) == 360000, out(pg)[:250])
            # 5. one jointly owned home
            pg.click('[data-home="1"] [data-del-home]'); pg.click('[data-home="0"] [data-hk="own"][data-v="both"]'); settle(pg)
            check(vn + ' one home owned by both: each owns one (IRAS counts a share in full), ABSD 20%, the home counted once', '$360,000' in out(pg) and absd_of([1, 1], True) == 360000 and pg.locator('[data-home]').count() == 1, out(pg)[:250])
            # mixed: Person 1 owns their own home and a share in one with Person 2
            pg.click('[data-chp="who"] [data-add-home]'); pg.click('[data-home="1"] [data-hk="own"][data-v="0"]'); pg.click('[data-home="1"] [data-hk="mort"][data-v="no"]'); settle(pg)
            check(vn + ' mixed ownership (2 and 1): Person 1 buys a third, so ABSD 30% ($540,000), as the engine gives', '$540,000' in out(pg) and absd_of([2, 1]) == 540000, out(pg)[:250])
            # one home sold at a time (until several sales are supported)
            pg.click('[data-home="0"] [data-hk="act"][data-v="sell"]'); pg.click('[data-home="1"] [data-hk="act"][data-v="sell"]'); settle(pg)
            acts = pg.evaluate("()=>[...document.querySelectorAll('[data-hk=act][aria-pressed=true]')].map(b=>b.dataset.v)")
            check(vn + ': one home can be sold in a plan for now; the other returns to Keeping, and the page says so', acts == ['keep', 'sell'] and 'One home can be sold' in pg.inner_text('[data-homes-note]'), [acts, pg.inner_text('[data-homes-note]')])
            # still paying, with no answer: the page asks; a loan is never inferred from a missing repayment
            pg.click('[data-home="1"] [data-del-home]'); pg.click('[data-chp="who"] [data-add-home]'); settle(pg)
            check(vn + ': a new home asks “Still paying a home loan on it?” and the note lists it as still to answer', 'Still to answer' in pg.inner_text('[data-homes-note]') and pg.locator('[data-home="1"] [data-hk="mort"][aria-pressed="true"]').count() == 0, pg.inner_text('[data-homes-note]'))
            pg.click('[data-home="1"] [data-del-home]'); settle(pg)
            # 6. a buyer who is not taking the new loan: their home still counts for stamp duty, their loan not for the borrowers'
            pg.click('[data-home="0"] [data-hk="own"][data-v="1"]'); pg.click('[data-home="0"] [data-hk="act"][data-v="keep"]'); pg.click('[data-home="0"] [data-hk="mort"][data-v="yes"]'); pg.fill('[data-home="0"] [data-hk="amt"]', '900')
            pg.check('[data-k="p.1.nb"] >> visible=true'); settle(pg)
            enb = pg.evaluate("()=>{const s=GW_FIN3.withHomes({n:2,p:[{res:'SC'},{res:'SC',nb:true}],loans:[],pkind:'new',price:1800000},[{own:'1',act:'keep',mort:'yes',amt:900}]);const c=GW_FIN3.cost(s);return {absd:c.absd,ltv:c.ltv}}")
            check(vn + ' Person 2 not taking the loan, owning a home: ABSD 20% stays (their home counts), the loan limit stays 75% (their loan is not a borrower’s)', '$360,000' in out(pg) and enb['absd'] == 360000 and enb['ltv'] == 0.75 and '75%' in pg.inner_text('[data-chip="loan"]'), [enb, pg.inner_text('[data-chip="loan"]')])
            pg.evaluate("()=>window.__f3OpenChip(null)")
            check(vn + ' cost page: no sideways scroll; no script errors', pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1') and not errs, errs)
            # an old saved plan (one home owned by both, kept, its loan listed) becomes the same home, with the same figures
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]')
            pg.evaluate("()=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:{n:'2','p.0.res':'SC','p.1.res':'SC',price:'1,800,000',homes:'1',whose:'both',order:'none'},loans:[{type:'home',who:0,amt:'1,400'},{type:'car',who:1,amt:'300'}]}))}")
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]'); settle(pg)
            hs = pg.evaluate("()=>JSON.parse(sessionStorage.getItem('gw.fin3.v1')).homes")
            eo = pg.evaluate("()=>{const c=GW_FIN3.cost({n:2,p:[{res:'SC'},{res:'SC'}],loans:[{type:'home',who:0,amt:1400},{type:'car',who:1,amt:300}],pkind:'new',price:1800000,homes:1,whose:'both'});return {absd:c.absd,ltv:c.ltv}}")
            check(vn + ': an old saved plan converts to one home owned by both, still paying $1,400; the car loan stays a loan; same ABSD and loan limit as before', hs == [{'own': 'both', 'type': 'hdb', 'act': 'keep', 'mort': 'yes', 'amt': '1,400'}] and '$360,000' in out(pg) and eo['ltv'] == 0.45 and '45%' in pg.inner_text('[data-chip="loan"]'), [hs, eo, pg.inner_text('[data-chip="loan"]')])
            # Ken’s review (27 Oct): an old plan that owned a home but listed no repayment is NOT taken as fully paid: it is asked, the funding check waits, everything else is kept
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]')
            pg.evaluate("()=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:{n:'2','p.0.res':'SC','p.1.res':'PR','p.0.age':'40','p.0.fixed':'9,000','p.1.age':'38','p.1.fixed':'6,000',price:'1,800,000',cash:'250,000',homes:'1',whose:'both',order:'none'},loans:[{type:'car',who:1,amt:'300'}]}))}")
            pg.goto(B + '/tools/payment-planner/?j=1'); pg.wait_for_selector('[data-out]'); settle(pg)
            hs = pg.evaluate("()=>JSON.parse(sessionStorage.getItem('gw.fin3.v1')).homes")
            check(vn + ' old plan with no repayment listed: the home converts with its loan status unanswered (not “fully paid”), the other entries kept', hs == [{'own': 'both', 'type': 'hdb', 'act': 'keep', 'mort': '', 'amt': ''}] and pg.input_value('[data-k="p.1.fixed"] >> nth=0') == '6,000' and pg.input_value('[data-k="cash"] >> nth=0') == '250,000', hs)
            check(vn + ' ... the cost card says it is not answered yet and what that means, with a way to answer', pg.is_visible('[data-out] [data-home-ask]') and 'Not answered yet' in pg.inner_text('[data-home-ask]'), out(pg)[-300:])
            # V3.12 Stage 2 (Ken, 27 Oct): no dependent figure until it is answered: the cash, CPF and instalment wait (stamp duty, which does not depend on it, shows)
            o0 = out(pg)
            check(vn + ' Stage 2 ... the cost card shows no cash, CPF or instalment until it is answered; stamp duty (not loan-dependent) still shows', 'Waiting for one answer' in o0 and figs(pg)[:3] == ['—', '—', '—'] and pg.locator('[data-out] [data-answer]').count() == 0 and figs(pg)[3] == '$599,600' and '$540,000 ABSD 30%' in o0, o0[:500])
            check(vn + ' Stage 2 ... the funding check gives no result until it is answered', pg.locator('[data-fund-out] .pl-fund, [data-fund-out] table').count() == 0 and (pg.locator('[data-fund-home-ask]').count() == 1 or not pg.is_visible('[data-fund]')), pg.inner_text('[data-fund-out]')[:200])
            pg.click('[data-out] [data-open-who]'); pg.click('[data-chp="who"] [data-home="0"] [data-hk="mort"][data-v="no"]'); settle(pg); pg.evaluate("()=>window.__f3OpenChip(null)"); settle(pg)
            check(vn + ' ... answered “No, fully paid”: the note goes and the figures appear (the engine’s, 75%)', pg.locator('[data-home-ask]').count() == 0 and pg.locator('[data-out] [data-answer]').count() >= 1 and '—' not in figs(pg), out(pg)[:300])
            pg.evaluate("window.__f3AllPay(true)"); pg.fill('[data-k="otp"]', '2027-02-01'); pg.click('[data-fund] summary'); settle(pg)
            check(vn + ' ... and the funding check runs', pg.locator('[data-fund-home-ask]').count() == 0 and len(pg.inner_text('[data-fund-out]')) > 200, pg.inner_text('[data-fund-out]')[:200])
            # the same old plan on the borrowing page: whether each owner has a housing loan is asked, not set to None
            pg.evaluate("()=>{sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:{n:'2','p.0.age':'40','p.0.fixed':'9,000','p.1.age':'38','p.1.fixed':'6,000',homes:'1',whose:'both'},loans:[]}))}")
            pg.goto(B + '/tools/tdsr/?j=1'); pg.wait_for_selector('[data-out]'); settle(pg)
            check(vn + ' old plan on the borrowing page: housing loans are asked for each owner (no answer chosen), and no loan figure until then', pg.locator('[data-k="p.0.hl"] [aria-pressed="true"]').count() == 0 and pg.locator('[data-k="p.1.hl"] [aria-pressed="true"]').count() == 0 and pg.is_visible('[data-hl-ask]') and pg.locator('[data-cap]').count() == 0, out(pg)[:300])
            seg(pg, 'p.0.hl', '0'); seg(pg, 'p.1.hl', '0'); settle(pg)
            check(vn + ' ... answered None for both: the loan appears', pg.locator('[data-cap]').count() == 1)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'ownership-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
