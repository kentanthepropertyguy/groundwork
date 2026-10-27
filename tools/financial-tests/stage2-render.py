import os, pathlib, re, socket, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
"""V3.12 Stage 2 (Ken, 27 Oct 2026): the verified corrections, in the browser (desktop and phone). Every figure is checked against the engines given the same answers.
  1. Two borrowers with a separate housing loan each: 35% by default (the internal setting LTV_JOINT_SEPARATE_LOANS = conservative, until banks confirm), with one line
     that 45% may apply, compared at the same price; per_borrower gives 45%. Selling first with a loan: 75% assuming the sale documents reach the bank in time, the 45%
     fallback stated; buying first 45%, with a line that it may rise.
  2. A home owned by both, sold first: the cost card and the funding check agree on ABSD ($0; Stage 1's funding check gave $360,000). Bought first, the ABSD is
     shown as paid upfront, with any refund later conditional and not counted.
  3. Mortgage status: no dependent figure until it is answered (the cost card waits; the borrowing page's budget waits for an owner's confirmed housing loans).
Run from the site folder: python3 tools/financial-tests/stage2-render.py"""
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
    else: fail += 1; print('  FAIL', n, repr(str(i)[:1500]))
amt = lambda s: int(re.sub(r'[^0-9]', '', s)) if s and re.search(r'\d', s) else None
def settle(pg): pg.wait_for_function('window.__f3Settled && window.__f3Settled()', timeout=15000); pg.wait_for_timeout(150)
def fresh(pg, path): pg.goto(B + path); pg.wait_for_selector('[data-out]'); pg.evaluate('sessionStorage.clear()'); pg.reload(); pg.wait_for_selector('[data-out]'); settle(pg)
def seg(pg, k, v): pg.click(f'[data-k="{k}"] [data-v="{v}"] >> visible=true')
def out(pg): return pg.inner_text('[data-out]')
def figs(pg): return pg.evaluate("()=>[...document.querySelectorAll('[data-out] .f3-ar .f3-af')].map(x=>x.textContent.trim())")
def saved(pg, path, raw, homes, loans=None):
    pg.goto(B + path + '?j=1'); pg.wait_for_selector('[data-out]')
    pg.evaluate("a=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:a.raw,loans:a.loans,homes:a.homes}))}", {'raw': raw, 'homes': homes, 'loans': loans or []})
    pg.goto(B + path + '?j=1'); pg.wait_for_selector('[data-out]'); settle(pg)
COUPLE = {'n': '2', 'p.0.res': 'SC', 'p.1.res': 'SC', 'p.0.age': '41', 'p.0.fixed': '9,800', 'p.1.age': '37', 'p.1.fixed': '6,500', 'couple': 'yes', 'price': '1,800,000', 'pkind': 'completed',
          'otp': '2027-02-01', 'cash': '600,000', 'cpf': '200,000', 'sale.price': '900,000', 'sale.loan': '200,000', 'sale.cpfRefund': '250,000', 'saleWhen': 'date', 'saleMonth': '4',
          'cpfBal.0.oa': '300,000', 'cpfBal.0.sa': '200,000', 'cpfBal.1.oa': '250,000', 'cpfBal.1.sa': '150,000', 'cover95': 'yes'}
ENGINE = """a=>{const st=Object.assign({n:2,p:[{age:41,fixed:9800,res:'SC'},{age:37,fixed:6500,res:'SC'}],price:1800000,pkind:'completed',otp:'2027-02-01',cash:600000,cpf:200000,ratePct:4,loans:[],couple:true,
  cpfBal:[{oa:300000,sa:200000},{oa:250000,sa:150000}],cover95:true,sale:{price:900000,loan:200000,cpfRefund:250000},saleWhen:'date',saleMonth:4,refund:!!a.refund});
  const s=GW_FIN3.withHomes(st,a.homes,a.order),c=GW_FIN3.cost(s),f=GW_FIN3.funding(s);return {absd:c.absd,ltv:c.ltv,fAbsd:f.ok?f.r.duty.absd:null,fLtv:f.ok?f.r.loan.ltv:null}}"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in (('desktop', {'viewport': {'width': 1280, 'height': 900}}), ('phone', {'viewport': {'width': 390, 'height': 844}, 'is_mobile': True, 'has_touch': True})):
            ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
            # ===== 1. the loan limit, each borrower's own loans (How much can I borrow?) =====
            fresh(pg, '/tools/tdsr/')
            seg(pg, 'n', '2'); pg.fill('[data-inc] [data-k="p.0.fixed"]', '9,000'); pg.fill('[data-inc] [data-k="p.1.fixed"]', '7,000'); settle(pg)
            seg(pg, 'p.0.hl', '1'); pg.fill('[data-k="p.0.hlAmt"]', '1,200'); seg(pg, 'p.1.hl', '1'); pg.fill('[data-k="p.1.hlAmt"]', '900'); settle(pg)
            e = pg.evaluate("()=>GW_FIN3.borrow({n:2,p:[{fixed:9000},{fixed:7000}],loans:[{type:'home',who:0,amt:1200},{type:'home',who:1,amt:900}],bkind:'private',ratePct:null,years:null},{assumeAge:true})")
            check(vn + ' L4 a separate housing loan each: 35% by default, 45% in one line beside it, $2,100 counted once each, the engine’s loan', e['ltv'] == 0.35 and e['altLtv'] == 0.45 and 'covers only 35%' in out(pg) and '45% may apply' in out(pg) and 'after your $2,100 of loans' in out(pg) and abs(amt(pg.inner_text('[data-cap]')) - e['maxLoan']) < 1000, [e['ltv'], out(pg)[:300]])
            seg(pg, 'p.0.hl', '0'); seg(pg, 'p.1.hl', '0'); seg(pg, 'jl', '1'); pg.fill('[data-k="jlAmt"]', '1,500'); settle(pg)
            check(vn + ' L5 a joint loan, once: 45%, $1,500 once, no alternative line', 'covers only 45%' in out(pg) and 'after your $1,500 of loans' in out(pg) and pg.locator('[data-ltv-alt]').count() == 0)
            seg(pg, 'p.0.hl', '1'); pg.fill('[data-k="p.0.hlAmt"]', '1,200'); settle(pg)
            check(vn + ' L8 Person 1’s own loan and the joint loan: 35%, $2,700, unchanged', 'covers only 35%' in out(pg) and 'after your $2,700 of loans' in out(pg))
            seg(pg, 'jl', '0'); seg(pg, 'p.0.hl', '0'); settle(pg)
            # ===== 3a. the budget waits for an owner's housing loans to be confirmed (None is only the starting choice) =====
            fresh(pg, '/tools/tdsr/')
            pg.fill('[data-inc] [data-k="p.0.fixed"]', '12,000'); settle(pg)
            pg.click('[data-cashrow] > summary'); pg.fill('[data-k="cash"]', '400,000'); pg.fill('[data-k="cpf"]', '150,000'); settle(pg)
            seg(pg, 'p.0.own', '1'); settle(pg)
            if pg.is_visible('[data-k="cover95"]'):
                seg(pg, 'cover95', 'yes'); pg.fill('[data-k="cpfBal.0.oa"]', '200,000'); pg.fill('[data-k="cpfBal.0.sa"]', '150,000'); settle(pg)
            check(vn + ' 3a owning a property with the housing loans never chosen: the loan shows, the budget waits and asks to confirm them', pg.locator('[data-cap]').count() == 1 and pg.locator('[data-budget]').count() == 0 and pg.is_visible('[data-hl-confirm]') and 'confirm your housing loans' in pg.inner_text('[data-hl-confirm]'), out(pg)[:400])
            seg(pg, 'p.0.hl', '0'); settle(pg)
            if pg.is_visible('[data-k="cover95"]'):
                seg(pg, 'cover95', 'yes'); pg.fill('[data-k="cpfBal.0.oa"]', '200,000'); pg.fill('[data-k="cpfBal.0.sa"]', '150,000'); settle(pg)
            check(vn + ' 3a ... “None” chosen: the budget appears', pg.locator('[data-budget]').count() == 1 and pg.locator('[data-hl-confirm]').count() == 0, out(pg)[:300])
            fresh(pg, '/tools/tdsr/')
            pg.fill('[data-inc] [data-k="p.0.fixed"]', '12,000'); pg.click('[data-cashrow] > summary'); pg.fill('[data-k="cash"]', '400,000'); settle(pg)
            seg(pg, 'p.0.own', '0'); settle(pg)
            check(vn + ' 3a owning no property: no confirmation needed, the budget shows at once (unchanged)', pg.locator('[data-budget]').count() == 1 and pg.locator('[data-hl-confirm]').count() == 0)
            # ===== 2. a home owned by both, sold first / bought first (What will this home cost me?) =====
            H = [{'own': 'both', 'type': 'hdb', 'act': 'sell', 'mort': 'yes', 'amt': '1,500'}]
            saved(pg, '/tools/payment-planner/', dict(COUPLE, order='sell'), H)
            en = pg.evaluate(ENGINE, {'homes': [{'own': 'both', 'type': 'hdb', 'act': 'sell', 'mort': 'yes', 'amt': 1500}], 'order': 'sell'})
            o = out(pg)
            check(vn + ' S1 a home owned by both, sold first: the cost card shows no ABSD (IRAS: it stops counting for both owners once the buyer exercises the option)', 'ABSD' not in pg.inner_text('[data-duty-line]') and en['absd'] == 0, o[:300])
            pg.evaluate("window.__f3AllPay(true)"); pg.click('[data-fund] summary'); settle(pg)
            fo = pg.inner_text('[data-fund-out]')
            check(vn + ' S1 ... and the funding check agrees: no ABSD (Stage 1: $360,000)', en['fAbsd'] == 0 and len(fo) > 200 and not re.search(r'ABSD[^\n]*\$[1-9]', fo), fo[:400])
            # sold first with its loan running: 75% assumed (sale documents in time), the 45% fallback stated, the same in the funding check (Claude E: Notice 632 para 8(a)(ii))
            cl = pg.inner_text('[data-out] [data-ltv-cond="sell"]') if pg.locator('[data-out] [data-ltv-cond="sell"]').count() else ''
            check(vn + ' S1 cost card: 75% (Stage 1: 45%), one line: it assumes the sale documents reach the bank in time, otherwise 45% and about $540,000 more upfront; the documents closed', en['ltv'] == 0.75 and cl.startswith('The 75% loan limit assumes your bank receives your sale documents before releasing your new loan. Otherwise it is 45%, about $540,000 more upfront.') and not pg.is_visible('[data-ltv-why]') and pg.locator('[data-out] .f3-alert [data-ltv-cond]').count() == 0, cl)
            pg.click('[data-out] [data-ltv-more]'); pg.wait_for_timeout(100)
            check(vn + ' S1 ... “What the bank needs” opens the documents (an HDB flat: HDB’s approval) and the TDSR treatment, on request only', 'HDB’s letter approving your flat’s sale' in pg.inner_text('[data-ltv-why]') and 'debt limit (TDSR)' in pg.inner_text('[data-ltv-why]'))
            check(vn + ' S1 funding check: the same 75% and the same fallback (45%, 25% in cash)', en['fLtv'] == 0.75 and pg.locator('[data-fund-cond="sell"]').count() == 1 and 'Otherwise it is 45%, with at least 25% in cash' in pg.inner_text('[data-fund-cond="sell"]'), fo[:300])
            check(vn + ' “Sell first” is defined once, in plain words', pg.locator('text=Sell first: your buyer exercises the option before you exercise yours.').count() >= 1)
            saved(pg, '/tools/payment-planner/', dict(COUPLE, order='buy'), H)
            en = pg.evaluate(ENGINE, {'homes': [{'own': 'both', 'type': 'hdb', 'act': 'sell', 'mort': 'yes', 'amt': 1500}], 'order': 'buy'})
            o = out(pg)
            ab = pg.inner_text('[data-absd-upfront]')
            check(vn + ' S2 bought first: one short line under the cash: the $360,000 ABSD (named once, counted in the cash) is paid upfront, a refund only maybe and later; no warning box; the conditions closed', en['absd'] == 360000 and ab.startswith('ABSD is payable upfront. You may qualify for a refund after selling your existing home.') and '$360,000 ABSD 20%' in pg.inner_text('[data-duty-line]') and '$1,209,600' in pg.inner_text('[data-answer]') and pg.locator('[data-out] .f3-alert [data-absd-upfront]').count() == 0 and not pg.is_visible('[data-absd-why]') and pg.locator('[data-out] [data-absd-upfront]').evaluate('e=>!!e.closest(".f3-ar")'), ab)
            pg.click('[data-absd-more]'); pg.wait_for_timeout(100)
            check(vn + ' S2 ... “How the refund works” opens IRAS’s conditions (within 6 months), on request only', pg.is_visible('[data-absd-why]') and 'within 6 months of buying a completed home' in pg.inner_text('[data-absd-why]') and 'their buyer exercises the option' in pg.inner_text('[data-absd-why]') and 'claimed from IRAS after the sale' in pg.inner_text('[data-absd-why]'), pg.inner_text('[data-absd-upfront]'))
            pg.click('[data-bd] summary'); pg.wait_for_timeout(150)
            check(vn + ' S2 ... the breakdown’s ABSD line: paid upfront; any refund later conditional and not counted', 'paid upfront, usually in cash first. Any refund later is conditional and not counted' in pg.inner_text('[data-bd-out]'), pg.inner_text('[data-bd-out]')[:400])
            check(vn + ' S2 bought first: 45%, one line that the bank may lend more once it has the sale documents (not assumed)', en['ltv'] == 0.45 and pg.locator('[data-out] [data-ltv-cond="buy"]').count() == 1 and 'may lend more. Not assumed here.' in pg.inner_text('[data-ltv-cond="buy"]'))
            pg.evaluate("window.__f3AllPay(true)"); pg.click('[data-fund] summary'); settle(pg)
            check(vn + ' S2 ... the funding check charges the $360,000 ABSD upfront too', en['fAbsd'] == 360000 and '360,000' in pg.inner_text('[data-fund-out]'), pg.inner_text('[data-fund-out]')[:300])
            saved(pg, '/tools/payment-planner/', dict(COUPLE, order='sell'), [{'own': '0', 'type': 'hdb', 'act': 'sell', 'mort': 'no', 'amt': ''}, {'own': '1', 'type': 'private', 'act': 'keep', 'mort': 'yes', 'amt': '900'}])
            en = pg.evaluate(ENGINE, {'homes': [{'own': '0', 'type': 'hdb', 'act': 'sell', 'mort': 'no'}, {'own': '1', 'type': 'private', 'act': 'keep', 'mort': 'yes', 'amt': 900}], 'order': 'sell'})
            check(vn + ' S3 Person 1 sells a paid-up home first, Person 2 keeps theirs with a loan: 20% ABSD on the card and in the check; Person 2’s loan counts (45%) (Stage 1: 75%)', en['absd'] == 360000 and en['fAbsd'] == 360000 and en['fLtv'] == 0.45 and '$360,000' in out(pg), en)
            # L4 on the cost card: 35%, and 45% compared at the same price (the loan and the upfront), not as a different price
            saved(pg, '/tools/payment-planner/', dict(COUPLE, order='none'), [{'own': '0', 'type': 'hdb', 'act': 'keep', 'mort': 'yes', 'amt': '1,200'}, {'own': '1', 'type': 'private', 'act': 'keep', 'mort': 'yes', 'amt': '900'}])
            en = pg.evaluate(ENGINE, {'homes': [{'own': '0', 'type': 'hdb', 'act': 'keep', 'mort': 'yes', 'amt': 1200}, {'own': '1', 'type': 'private', 'act': 'keep', 'mort': 'yes', 'amt': 900}], 'order': None})
            check(vn + ' L4 cost card: 35%; one line: 45% may apply, at this price $180,000 more loan and $180,000 less upfront; the bank confirms', en['ltv'] == 0.35 and pg.inner_text('[data-out] [data-ltv-alt]').strip() == '45% may apply if your bank counts each borrower’s own housing loans: at this price, $180,000 more loan and $180,000 less upfront. Your bank confirms the limit.' and '35%' in pg.inner_text('[data-chip="loan"]'), pg.inner_text('[data-out]')[:500])
            # ===== 3b. a new home's loan status unanswered: the cost card waits, stamp duty shows =====
            saved(pg, '/tools/payment-planner/', dict(COUPLE, order='none'), [{'own': 'both', 'type': 'hdb', 'act': 'keep', 'mort': '', 'amt': ''}])
            f = figs(pg)
            check(vn + ' 3b loan status not answered: no cash, CPF or instalment; stamp duty (not loan-dependent) shows; the page asks', f[:3] == ['—', '—', '—'] and f[3] == '$419,600' and pg.is_visible('[data-home-ask]') and pg.locator('[data-out] [data-answer]').count() == 0, f)
            check(vn + ' 3b ... the loan chip states no limit meanwhile', pg.inner_text('[data-chip="loan"]').strip() == 'Loan', pg.inner_text('[data-chip="loan"]'))
            pg.click('[data-out] [data-open-who]'); pg.click('[data-chp="who"] [data-home="0"] [data-hk="mort"][data-v="yes"]'); pg.fill('[data-chp="who"] [data-home="0"] [data-hk="amt"]', '1,500'); settle(pg); pg.evaluate("()=>window.__f3OpenChip(null)"); settle(pg)
            en = pg.evaluate(ENGINE, {'homes': [{'own': 'both', 'type': 'hdb', 'act': 'keep', 'mort': 'yes', 'amt': 1500}], 'order': None})
            check(vn + ' 3b ... answered “Still paying”: the figures appear, with the engine’s 45% limit', pg.locator('[data-home-ask]').count() == 0 and '—' not in figs(pg) and en['ltv'] == 0.45 and '45%' in pg.inner_text('[data-chip="loan"]'), [figs(pg), pg.inner_text('[data-chip="loan"]')])
            check(vn + ': no sideways scroll; no script errors', pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1') and not errs, errs)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'stage2-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
