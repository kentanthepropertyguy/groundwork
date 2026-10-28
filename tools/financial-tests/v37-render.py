import os, pathlib, re, socket, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
"""V3.7 (Ken, 27 Oct 2026), desktop 1440 and phone 390. Run from the site folder: python3 tools/financial-tests/v37-render.py
 A  Standalone calculators share nothing; Plan My Move (?j=1) carries its figures; explicit hand-offs carry only what they name, and say so;
    Start fresh, refresh and Back/Forward behave.
 B  What will this home cost me?, by purchase type, against figures worked out from the rules (not from the engines):
    new launch: the upfront sum (booking, S&P, BSD, ABSD) first, then the buyer's construction share, the total, the bank;
    completed private: option, exercise, stamp duty, the balance at completion, the bank; never a construction stage;
    HDB resale and new HDB (BTO), HDB loan and bank loan: cash, CPF, loan, stages and stamp duty timing (HDB, CPF Board, IRAS).
 C  The stage rows never overlap or overflow, desktop to 200% zoom; Save as PDF fits one page (A4 or Letter) with Ken's photograph."""
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
def bsd(p):
    t, rest = 0, p
    for size, r in [(180000, .01), (180000, .02), (640000, .03), (500000, .04), (1500000, .05), (float('inf'), .06)]:
        a = min(rest, size); t += a * r; rest -= a
        if rest <= 0: break
    return round(t)
def pmt(L, r, y): i = r / 12; n = y * 12; return L * i / (1 - (1 + i) ** -n)
def amt(s):   # the first dollar figure: "$1,234", "up to $1,000", "$500 to $2,000"
    m = re.search(r'\$?([\d,]+)', s or '')
    return int(m.group(1).replace(',', '')) if m and m.group(1).replace(',', '') else None
def settle(pg): pg.wait_for_function("()=>!window.__f3Settled||window.__f3Settled()"); pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.wait_for_timeout(250)
def ready(pg): pg.wait_for_selector('[data-out]'); pg.wait_for_function("()=>!!window.__f3OpenChip&&window.__f3Settled&&window.__f3Settled()")
def opened(pg, path): pg.goto(B + path); ready(pg)
def nav(pg, sel):   # a link that opens another page: wait for that page, then for its script
    with pg.expect_navigation(): pg.locator(sel).first.click()
    ready(pg)
def M(s):
    m = re.search(r'\$([\d.,]+)\s*(M?)', s or '')
    return None if not m else (round(float(m.group(1).replace(',', '')) * 1e6) if m.group(2) else int(m.group(1).replace(',', '').split('.')[0]))
def fill(pg, k, v):
    f = pg.locator(f'[data-k="{k}"]:visible').first
    if not f.count():
        pg.evaluate("k=>{const f=document.querySelector('[data-k=\"'+k+'\"]');const pn=f&&f.closest('[data-chp]');if(pn)window.__f3OpenChip(pn.dataset.chp,k);const cu=f&&f.closest('[data-cust]');if(cu)cu.hidden=false;let d=f&&f.closest('details');while(d){d.open=true;d=d.parentElement.closest('details')}}", k)
        f = pg.locator(f'[data-k="{k}"]:visible').first
    f.wait_for(state='visible', timeout=8000); f.fill(v); pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)"); settle(pg)
def opt(pg, chip, text): pg.evaluate("k=>window.__f3OpenChip(k)", chip); pg.wait_for_timeout(150); pg.locator(f'[data-optl="{chip}"] .f3-opt', has_text=text).first.evaluate('b=>b.click()'); settle(pg); pg.evaluate("()=>window.__f3OpenChip(null)"); settle(pg)
def val(pg, k): return pg.evaluate("k=>{const f=document.querySelector('[data-k=\"'+k+'\"]');return f?f.value:null}", k)
def out(pg): return pg.inner_text('[data-out]')
def rows(pg): return pg.evaluate("()=>[...document.querySelectorAll('[data-stages] .f3-sr')].map(r=>[r.querySelector('.f3-sl').textContent.trim(),r.querySelector('.f3-sr1>b').textContent.trim(),(r.querySelector('.f3-sw')||{}).textContent||'',(r.closest('[data-sg]')||{dataset:{}}).dataset.sg||''])")
def store(pg): return pg.evaluate("()=>{const o={};for(let i=0;i<sessionStorage.length;i++){const k=sessionStorage.key(i);o[k]=sessionStorage.getItem(k)}return o}")
OVL = """()=>{const bad=[];document.querySelectorAll('[data-stages] .f3-sr,[data-out] .f3-ar').forEach(r=>{const els=[...r.querySelectorAll('.f3-sl,.f3-sr1>b,.f3-sw,.f3-an,.f3-asub,.f3-af')];const R=r.getBoundingClientRect();
 els.forEach(e=>{const a=e.getBoundingClientRect();if(a.right>R.right+1||a.left<R.left-1)bad.push('wide:'+e.textContent.slice(0,30))});
 for(let i=0;i<els.length;i++)for(let j=i+1;j<els.length;j++){const a=els[i].getBoundingClientRect(),b=els[j].getBoundingClientRect();if(a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1)bad.push('overlap:'+els[i].textContent.slice(0,20)+'|'+els[j].textContent.slice(0,20))}});return bad}"""
SHEET = "()=>{const h=GW_SHEET.mount(window.__f3Sheet());const m=h.querySelector('.gs-main');const r={fits:m.scrollHeight<=m.clientHeight+1,photo:!!h.querySelector('[data-sheet-photo]'),photoSrc:(h.querySelector('[data-sheet-photo]')||{}).getAttribute?h.querySelector('[data-sheet-photo]').getAttribute('src'):'',f1:(h.querySelector('[data-sheet-fig]')||{}).textContent,txt:h.textContent,clipped:[...h.querySelectorAll('.gs-rw,.gs-rn,.gs-rv,.gs-note,.gs-fs')].filter(e=>e.scrollWidth>e.clientWidth+1).length};GW_SHEET.unmount();return r}"
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        kw = dict(viewport=vp, is_mobile=tag == 'phone', has_touch=tag == 'phone')
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        # ================= A. standalone vs Plan My Move =================
        opened(pg, '/tools/tdsr/'); pg.evaluate("sessionStorage.clear()")
        fill(pg, 'p.0.fixed', '15,000'); fill(pg, 'p.0.age', '40'); fill(pg, 'cpf', '150,000')
        opened(pg, '/tools/payment-planner/')
        check(f'{tag} A1: Borrow, then Cost opened on its own: no income, age or CPF carried, no "figures entered earlier" line', not val(pg, 'p.0.fixed') and not val(pg, 'p.0.age') and not val(pg, 'cpf') and pg.is_hidden('[data-carry]'), [val(pg, 'p.0.fixed'), val(pg, 'cpf')])
        ss = store(pg); shared = (ss.get('gw.fin.v1') or '') + (ss.get('gw.fin3.v1') or '')
        check(f'{tag} A1: nothing from a standalone calculator reaches the journey\'s shared figures', '15,000' not in shared and '15000' not in shared, shared[:200])
        opened(pg, '/tools/sale-proceeds/'); fill(pg, 'sale.price', '800,000'); fill(pg, 'sale.loan', '200,000')
        opened(pg, '/tools/hdb-upgrade/')
        check(f'{tag} A2: Sell, then Upgrade opened on its own: no sale figures carried', not val(pg, 'sale.price') and not val(pg, 'sale.loan'), [val(pg, 'sale.price')])
        # A3. Upgrade's own steps carry
        # V3.7.3: a step closes only on Done
        fill(pg, 'sale.price', '750,000'); pg.click('[data-stdone="worth"]'); settle(pg); fill(pg, 'sale.loan', '250,000'); fill(pg, 'sale.cpfRefund', '205,000'); pg.click('[data-stdone="sell"]'); settle(pg); fill(pg, 'p.0.fixed', '8,000'); fill(pg, 'p.0.age', '35'); pg.click('[data-stdone="borrow"]'); settle(pg)
        eng = pg.evaluate("()=>GW_FIN3.afford({n:1,p:[{age:35,fixed:8000,res:'SC'},{}],loans:[],cash:0,cpf:0,homes:1,plan:'sell',whose:'both',akind:'new',bkind:'private',sale:{type:'hdb',price:750000,loan:250000,cpfRefund:205000},cpfBal:[{},{}],ratePct:null,years:null}).budget")
        b0 = pg.inner_text('[data-budget]')
        check(f'{tag} A3: Upgrade from HDB carries its four steps into its budget (same as GW_FIN3.afford)', M(b0) is not None and abs(M(b0) - eng) <= 10000, [b0, eng])
        # A4. explicit hand-off: Borrow -> "See what a $X home costs me" carries the price only, and says so
        opened(pg, '/tools/tdsr/'); fill(pg, 'p.0.fixed', '15,000'); fill(pg, 'p.0.age', '40'); fill(pg, 'cpf', '150,000')
        toc = pg.locator('[data-to-cost]'); pg.wait_for_function("()=>{const t=document.querySelector('[data-to-cost]');return t&&!t.hidden}")
        price = int(toc.get_attribute('data-price')); nav(pg, '[data-to-cost]')
        check(f'{tag} A4: the hand-off brings the price ({price:,}) and nothing else (no income, age or CPF)', amt(val(pg, 'price')) == price and not val(pg, 'p.0.fixed') and not val(pg, 'p.0.age') and not val(pg, 'cpf'), [val(pg, 'price'), val(pg, 'p.0.fixed'), val(pg, 'cpf')])
        check(f'{tag} A4: and says where the price came from', 'brought in from How much can I borrow?' in pg.inner_text('[data-from-research]') and pg.is_visible('[data-from-research]'), pg.inner_text('[data-from-research]'))
        check(f'{tag} A4: the address carries no figure', not re.search(r'\d{4,}', pg.url.split(str(P), 1)[-1]), pg.url)
        # Back/Forward: Borrow comes back with its own entries; Cost keeps the price
        pg.go_back(); ready(pg)
        check(f'{tag} A7: Back to Borrow brings back its own entries', val(pg, 'p.0.fixed') == '15,000', val(pg, 'p.0.fixed'))
        pg.go_forward(); ready(pg)
        check(f'{tag} A7: Forward to Cost keeps the price that was brought in', amt(val(pg, 'price')) == price, val(pg, 'price'))
        pg.reload(); ready(pg)
        check(f'{tag} A7: a refresh keeps this calculator\'s own entries and offers Start fresh', amt(val(pg, 'price')) == price and pg.is_visible('[data-carry] [data-fresh]'))
        pg.click('[data-carry] [data-fresh]'); ready(pg)
        check(f'{tag} A6: Start fresh clears it: no price on the page, none kept for this calculator', not val(pg, 'price') and str(price) not in (store(pg).get('gw.fin3.pay.v1') or '').replace(',', ''), [val(pg, 'price'), store(pg).get('gw.fin3.pay.v1')])
        # A4c. Cost -> "Check my own borrowing limit" carries the price only, and says so
        opened(pg, '/tools/payment-planner/'); fill(pg, 'price', '3,000,000'); fill(pg, 'p.0.fixed', '20,000') if False else None
        nav(pg, '[data-open-borrow]'); fill(pg, 'p.0.fixed', '15,000'); fill(pg, 'p.0.age', '40')
        check(f'{tag} A4: Cost -> Borrow brings the price, shown as "For the $3,000,000 home" and said to be brought in', 'For the $3,000,000 home' in out(pg) and 'Price brought in from What will this home cost me?' in out(pg), out(pg)[-500:])
        # A4b. Sell -> "What can this buy me next?" carries the sale only
        opened(pg, '/tools/sale-proceeds/'); fill(pg, 'sale.price', '800,000'); fill(pg, 'sale.loan', '200,000'); fill(pg, 'sale.cpfRefund', '170,000')
        nav(pg, '[data-to-borrow]')
        # V3.12 Stage 1 (Ken, 27 Oct 2026): the sale waits as an offer on the borrowing page (added only on request); nothing else comes with it
        check(f'{tag} A4: Sell -> Borrow offers the sale’s cash and CPF, says where they come from, counts nothing yet; no income', pg.is_visible('[data-offer-add]') and 'From What will I get from selling?' in pg.inner_text('[data-saleoffer]') and not val(pg, 'cash') and not val(pg, 'p.0.fixed'), [val(pg, 'sale.price'), val(pg, 'p.0.fixed'), pg.evaluate("()=>[...document.querySelectorAll('[data-sale-line]')].map(x=>[x.textContent.slice(0,60),!!x.offsetParent])")])
        # A5. Plan My Move carries between its steps, and stays apart from the standalone calculators
        pg.goto(B + '/journey/'); pg.evaluate("sessionStorage.clear()")
        opened(pg, '/tools/tdsr/?j=1'); fill(pg, 'p.0.fixed', '12,000'); fill(pg, 'p.0.age', '38')
        opened(pg, '/tools/payment-planner/?j=1')
        check(f'{tag} A5: Plan My Move (?j=1): income and age carry from Borrow to Cost', val(pg, 'p.0.fixed') == '12,000' and val(pg, 'p.0.age') == '38', [val(pg, 'p.0.fixed')])
        opened(pg, '/tools/payment-planner/')
        check(f'{tag} A5: the same calculator opened from Calculators does not see the journey\'s figures', not val(pg, 'p.0.fixed'))
        opened(pg, '/tools/tdsr/?j=1')
        check(f'{tag} A5: and the journey still has them afterwards', val(pg, 'p.0.fixed') == '12,000')
        pg.goto(B + '/journey/#up'); pg.wait_for_load_state()
        lk = pg.locator('[data-gw-up] a[href*="tools/hdb-upgrade/"], main [data-gw-guide] a[href*="tools/hdb-upgrade/"], [data-gw-up-go]').first
        if lk.count():
            with pg.expect_navigation(): lk.evaluate('a=>a.click()')
            check(f'{tag} A5: a calculator opened from Plan My Move is marked as the journey (?j=1)', 'j=1' in pg.url, pg.url)
        # ================= B. purchase types =================
        def cost(price, setup):
            opened(pg, '/tools/payment-planner/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg)
            fill(pg, 'price', price)
            for ch, t in setup: opt(pg, ch, t)
            if pg.locator('[data-home="0"] [data-hk="mort"]').count():   # V3.12 Stage 2: the home's loan status is answered (no loan), as the old “second home” assumed
                pg.evaluate("()=>document.querySelector('[data-home=\"0\"] [data-hk=\"mort\"][data-v=\"no\"]').click()"); ready(pg)
            return out(pg), rows(pg)
        # B1. Ken's new launch: $2.65M, PR, second home, 75%, no CPF
        P0 = 2650000; b, ab = bsd(P0), P0 * .30
        o, r = cost('2,650,000', [('who', 'Permanent Resident'), ('who', 'Second home')])
        up = pg.inner_text('[data-answer]')
        check(f'{tag} B1: new launch: the headline is the upfront sum, $1,427,100 (5% + 15% + BSD + ABSD)', amt(up) == P0 * .20 + b + ab == 1427100, up)
        check(f'{tag} B1: then $132,500 during construction and $1,559,600 in all, smaller', 'Then $132,500 during construction · $1,559,600 from you in all' in o, o[:500])
        want = [('Booking fee', P0 * .05, 'booking'), ('At the S&P', P0 * .15, 'snp'), ('Buyer’s stamp duty', b, 'snp'), ('ABSD', ab, 'snp'), ('Upfront, in all', 1427100, 'snp'), ('Foundation stage, your share', P0 * .05, 'build'), ('From you, in all', 1559600, ''), ('The bank pays', P0 * .75, 'bank')]
        check(f'{tag} B1: the stages: booking; S&P with BSD and ABSD apart; the upfront subtotal; the foundation share; the total; the bank', all(any(x[0].startswith(w[0]) and amt(x[1]) == w[1] and x[3] == w[2] for x in r) for w in want), r)
        check(f'{tag} B1: stamp duty is due within 14 days of the S&P', all('Within 14 days of signing the S&P' in x[2] for x in r if x[0] in ('Buyer’s stamp duty', 'ABSD')), r)
        # 28 Oct 2026 (Claude E audit F1): the instalment is the one from TOP, the tenure counted from the foundation release: $1,987,500 over 320 months at 4% = $10,111
        check(f'{tag} B1: the instalment is said from TOP ($10,111)', '$10,111' in o and ('TOP (estimated' in o or '(estimated TOP)' in o or '(after TOP)' in o))
        sh = pg.evaluate(SHEET)
        check(f'{tag} B1: Save as PDF leads with the same upfront figure, shows the stages, fits one page, nothing cut, with Ken\'s photograph', sh['f1'] == 'S$1,427,100' and 'Upfront, in all' in sh['txt'] and sh['fits'] and sh['clipped'] == 0 and sh['photo'] and sh['photoSrc'].endswith('assets/img/ken-circle-600.jpg'), {k: v for k, v in sh.items() if k != 'txt'})
        # B2. 55% loan limit: the buyer's share runs over several construction stages; nothing is hard-coded
        o, r = cost('2,000,000', [('rate', '35 years')]) if False else cost('2,000,000', [])
        fill(pg, 'loanAmt', '1,000,000'); o, r = out(pg), rows(pg)
        built = [x for x in r if x[3] == 'build']
        check(f'{tag} B2: a $1M loan on $2M: after the 20% upfront the buyer pays the other $600,000 during construction, stage by stage (foundation, framework, walls, roofing)', sum(amt(x[1]) for x in built) == 600000 and [x[0].split(' stage')[0] for x in built] == ['Foundation', 'Framework', 'Walls', 'Roofing'], built)
        # B3. completed private, SC first home, $1.2M with $200k CPF
        P1 = 1200000; o, r = cost('1,200,000', [('pkind', 'Completed private'), ('cpf', '$200,000')])
        want = [('Option fee', P1 * .01), ('Exercising the option', P1 * .04), ('Buyer’s stamp duty', bsd(P1)), ('Balance at completion', P1 * .20), ('From you, in all', P1 * .25 + bsd(P1)), ('The bank pays', P1 * .75)]
        check(f'{tag} B3: completed: option 1%, exercise 4%, stamp duty, balance at completion, the bank', all(any(x[0].startswith(w[0]) and amt(x[1]) == w[1] for x in r) for w in want), r)
        check(f'{tag} B3: completed: no construction stage anywhere, and stamp duty within 14 days of exercising the option', not any(x[3] == 'build' or 'Foundation' in x[0] for x in r) and 'Within 14 days of exercising the option' in ' '.join(x[2] for x in r), r)
        check(f'{tag} B3: completed: the headline stays the cash needed ($132,600 after $200k CPF)', amt(pg.inner_text('[data-answer]')) == P1 * .25 + bsd(P1) - 200000, pg.inner_text('[data-answer]'))
        # B4. HDB resale, $600k, SC first home, HDB loan (75%, no minimum cash; CPF Board) and bank loan (5% cash)
        o, r = cost('600,000', [('pkind', 'HDB resale flat')])
        check(f'{tag} B4: HDB resale is answered on this page (no dead end, no hand-over to Borrow)', 'aren’t worked out here' not in o and 'Cash you’ll need' in o)
        check(f'{tag} B4: HDB loan: $450,000 at 2.6% over 25 years = $2,042; BSD $12,600; cash or CPF $162,600', '$450,000 HDB loan' in o and '$2,042' in o and '$12,600' in o and amt(pg.inner_text('[data-answer]')) == 162600 and round(pmt(450000, .026, 25)) == 2042, o[:400])
        want = [('Option fee', 1000), ('Exercise fee', 4000), ('Rest of the down payment', 145000), ('Buyer’s stamp duty', 12600), ('From you, in all', 162600), ('The HDB loan pays', 450000)]
        check(f'{tag} B4: resale stages: option, exercise, the rest of the 25% after HDB accepts, stamp duty through HDB, the loan at completion; they reconcile', all(any(x[0].startswith(w[0]) and amt(x[1]) == w[1] for x in r) for w in want) and 1000 + 4000 + 145000 == 150000, r)
        check(f'{tag} B4: stamp duty timing is HDB\'s (through HDB by completion, from CPF by default), not the S&P\'s', any(x[0] == 'Buyer’s stamp duty' and 'Paid through HDB, by completion' in x[2] for x in r) and 'S&P' not in ' '.join(x[2] for x in r), r)
        check(f'{tag} B4: what is not checked is said (eligibility, grants, lease, fees)', 'HDB checks your eligibility' in o and 'CPF housing grant' in o)
        opt(pg, 'loan', 'Bank loan'); o, r = out(pg), rows(pg)
        check(f'{tag} B4: bank loan: at least $30,000 cash (5%), at 4%: $2,375', 'At least $30,000 in cash' in o and '$2,375' in o and any('$25,000 cash' in x[2] for x in r), o[:300])
        fill(pg, 'valuation', '580,000'); o = out(pg)
        check(f'{tag} B4: an HDB valuation below the price: the loan is on the valuation and the $20,000 above it is cash', '$435,000 bank loan' in o and '$20,000' in o, o[:300])
        # B5. new HDB (BTO), $500k, 4-room or bigger: HDB's $2,000 booking fee is part of the 10% down payment and is deducted at the Agreement for Lease
        #     (HDB, Sign Agreement for Lease). By signing: $2,000 + ($50,000 - $2,000) + $9,600 BSD = $59,600, of which $57,600 is payable at signing.
        o, r = cost('500,000', [('pkind', 'New HDB flat')])
        get = lambda lab: next((amt(x[1]) for x in r if x[0].startswith(lab)), None)
        check(f'{tag} B5: BTO, HDB loan: $59,600 needed by signing, the headline', amt(pg.inner_text('[data-answer]')) == 59600 and 'Needed by signing' in o, o[:400])
        check(f'{tag} B5: of it, $57,600 payable at the Agreement for Lease (the $48,000 rest of the 10% and $9,600 BSD), after the $2,000 booking fee', amt(pg.inner_text('[data-at-signing]')) == 57600 and get('Booking fee') == 2000 and get('Rest of the 10% down payment') == 48000 and get('Buyer’s stamp duty') == 9600 and get('Payable at signing') == 57600, r)
        check(f'{tag} B5: then $75,000 at key collection; it reconciles: $2,000 + $57,600 + $75,000 = $134,600 from you; $375,000 HDB loan', 'Then $75,000 at key collection · $134,600 from you in all' in o and get('Rest of the down payment') == 75000 and 2000 + 57600 + 75000 == 134600 and get('The HDB loan pays') == 375000, r)
        check(f'{tag} B5: BTO stamp duty at the Agreement for Lease', any(x[0] == 'Buyer’s stamp duty' and 'Agreement for Lease' in x[2] for x in r), r)
        opt(pg, 'pkind', '3-room'); r = rows(pg); get = lambda lab: next((amt(x[1]) for x in r if x[0].startswith(lab)), None)
        check(f'{tag} B5: a 3-room flat: HDB\'s $1,000 booking fee, so $58,600 at signing; still $59,600 by signing', get('Booking fee') == 1000 and get('Payable at signing') == 58600 and amt(pg.inner_text('[data-answer]')) == 59600, r)
        opt(pg, 'pkind', '4-room or bigger'); opt(pg, 'loan', 'Bank loan'); r = rows(pg); get = lambda lab: next((amt(x[1]) for x in r if x[0].startswith(lab)), None)
        check(f'{tag} B5: BTO, bank loan: $109,600 by signing; $107,600 at signing (the $98,000 rest of the 20% and $9,600), at least $25,000 of the 20% in cash; $25,000 at keys', amt(pg.inner_text('[data-answer]')) == 109600 and get('Payable at signing') == 107600 and get('Rest of the 20% down payment') == 98000 and any('at least $25,000 of the 20% in cash' in x[2] for x in r) and get('Rest of the down payment') == 25000, r)
        sh = pg.evaluate(SHEET)
        check(f'{tag} B5: Save as PDF for a new HDB flat: needed by signing first, the booking fee and the amount payable at signing named, fits, nothing cut, with the photograph', sh['f1'] == 'S$109,600' and 'Needed by signing' in sh['txt'] and 'S$107,600 payable at the Agreement for Lease' in sh['txt'] and 'Payable at signing' in sh['txt'] and 'Booking fee, 4-room or bigger' in sh['txt'] and sh['fits'] and sh['clipped'] == 0 and sh['photo'], {k: v for k, v in sh.items() if k != 'txt'})
        # ================= D. How much can I borrow?: two incomes on top; the prompt; the quiet line beneath the estimate =================
        def pv(m, r, y): i = r / 12; n = y * 12; return m * (1 - (1 + i) ** -n) / i
        opened(pg, '/tools/tdsr/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg)
        vis = lambda k: pg.evaluate("k=>!!document.querySelector('[data-inc] [data-k=\"'+k+'\"]')&&!!document.querySelector('[data-inc] [data-k=\"'+k+'\"]').offsetParent", k)
        check(f'{tag} D1: Just me: one income field at the top, no second one', vis('p.0.fixed') and not vis('p.1.fixed') and 'Monthly income, before CPF' in pg.inner_text('[data-inc]') and 'YOU' in pg.inner_text('[data-inc]').upper())
        pg.fill('[data-inc] [data-k="p.0.fixed"]', '12,000'); settle(pg)
        pg.click('[data-k="n"] [data-v="2"]')   # V3.12: "Who is borrowing?" sits above the people (no sheet)
        pg.wait_for_function("()=>document.activeElement&&document.activeElement.dataset.k==='p.1.fixed'", timeout=3000)
        focused = pg.evaluate("()=>document.activeElement&&document.activeElement.dataset.k==='p.1.fixed'&&!!document.activeElement.closest('[data-inc]')"); settle(pg)
        box = pg.evaluate("()=>['p.0.fixed','p.1.fixed'].map(k=>{const r=document.querySelector('[data-inc] [data-k=\"'+k+'\"]').getBoundingClientRect();return [Math.round(r.left),Math.round(r.top)]})")
        side = box[0][1] == box[1][1] and box[1][0] > box[0][0]; stacked = box[0][0] == box[1][0] and box[1][1] > box[0][1]
        check(f'{tag} D2: Two of us: both incomes at the top, labelled first and second person, ' + ('side by side' if tag == 'desktop' else 'stacked'), vis('p.1.fixed') and 'PERSON 1' in pg.inner_text('[data-inc]').upper() and 'PERSON 2' in pg.inner_text('[data-inc]').upper() and (side if tag == 'desktop' else stacked), box)
        check(f'{tag} D2: the choice takes the buyer to Person 2’s income, beside Person 1’s', focused)
        pg.evaluate("document.activeElement.blur()"); settle(pg)
        check(f'{tag} D6: second income blank: a prompt beside the inputs, the card says what it waits for, and no joint loan is shown', pg.is_visible('[data-inc-need]') and 'Add Person 2’s income to see what you can borrow together.' == pg.inner_text('[data-inc-need]') and 'ADD PERSON 2’S INCOME' in out(pg).upper() and not pg.query_selector('[data-cap]'), [pg.inner_text('[data-inc-need]'), out(pg)[:200]])
        fill(pg, 'p.0.age', '40'); fill(pg, 'p.1.age', '30')
        pg.fill('[data-inc] [data-k="p.1.fixed"]', '4,000'); settle(pg)
        iw = (12000 * 40 + 4000 * 30) / 16000; ten = min(30, int(65 - iw)); L = pv(16000 * .55, .04, ten)
        check(f'{tag} D7: both incomes in: the prompt goes and the loan is the joint one ($12k at 40 + $4k at 30: {L // 1000 * 1000:,.0f} over {ten} years, worked out independently)', pg.is_hidden('[data-inc-need]') and amt(pg.inner_text('[data-cap]')) == L // 1000 * 1000 and f'Over {ten} years' in out(pg), [pg.inner_text('[data-cap]'), L])
        pg.fill('[data-inc] [data-k="p.1.fixed"]', '6,000'); settle(pg)
        iw2 = (12000 * 40 + 6000 * 30) / 18000; L2 = pv(18000 * .55, .04, min(30, int(65 - iw2)))
        check(f'{tag} D7: changing the second income recalculates at once ({L2 // 1000 * 1000:,.0f})', amt(pg.inner_text('[data-cap]')) == L2 // 1000 * 1000, pg.inner_text('[data-cap]'))
        pg.click('[data-var] summary'); pg.fill('[data-k="p.1.bonusYr"]', '12,000'); settle(pg)
        L3 = pv((12000 + 6000 + 1000 * .7) * .55, .04, min(30, int(65 - iw2)))
        check(f'{tag} D8: the second person\'s bonus still counts (at 70%)', abs(amt(pg.inner_text('[data-cap]')) - L3 // 1000 * 1000) <= 1000, [pg.inner_text('[data-cap]'), L3])
        pg.click('[data-var] summary')
        check(f'{tag} D9: the quiet line sits beneath the estimate, once', pg.locator('[data-out] [data-indic]').count() == 1 and pg.inner_text('[data-out] [data-indic]') == 'Indicative only. Actual loan approval, rates and tenure vary by bank and borrower profile.' and pg.evaluate("()=>!!document.querySelector('[data-cap]').closest('.f3-ar').querySelector('[data-indic]')"))
        pg.click('[data-k="n"] [data-v="1"]'); settle(pg)
        check(f'{tag} D5: back to Just me: the second income is put away and the loan is the first person\'s alone', not vis('p.1.fixed') and pg.is_hidden('[data-inc-need]') and amt(pg.inner_text('[data-cap]')) == pv(12000 * .55, .04, 25) // 1000 * 1000, pg.inner_text('[data-cap]'))
        pg.click('[data-k="n"] [data-v="2"]'); settle(pg)
        check(f'{tag} D5: and Two of us again brings back the second person\'s entries', pg.input_value('[data-inc] [data-k="p.1.fixed"]') == '6,000' and amt(pg.inner_text('[data-cap]')) is not None)
        opened(pg, '/tools/tdsr/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg); pg.click('[data-k="n"] [data-v="2"]'); pg.evaluate("document.activeElement.blur()"); settle(pg)
        check(f'{tag} D6: Two of us with nothing typed: asks for both incomes', pg.inner_text('[data-inc-need]') == 'Add both incomes to see what you can borrow together.' and 'TYPE BOTH INCOMES TO BEGIN' in out(pg).upper())
        # the quiet line on Cost (private and HDB) once; not added where the card already says it is not a bank approval (Upgrade)
        cost('2,000,000', []); n1 = pg.locator('[data-out] [data-indic]').count()
        cost('600,000', [('pkind', 'HDB resale flat')]); n2 = pg.locator('[data-out] [data-indic]').count()
        check(f'{tag} D9: Cost shows the quiet line once beneath the instalment (private and HDB)', n1 == 1 and n2 == 1, [n1, n2])
        check(f'{tag} no script errors', not errs, errs)
        ctx.close()
    # ================= E. Upgrade from HDB, buy first (V3.7.2): the flat's loan is still running =================
    # Independent working (MAS LTV tiers and minimum cash; IRAS BSD; ABSD 20% for a Singapore Citizen's second home; TDSR 55% at 4%):
    # the buyer's cash must cover the minimum cash, ABSD and BSD (paid in cash first); cash and CPF together cover the down payment and duty.
    def bf_budget(cash, cpf, income, age, flat_loan, flat_mo):
        tiers = (0.45, 0.25) if flat_loan else (0.75, 0.05)
        yrs = min(30, 65 - age); ltdsr = (lambda m: m * (1 - (1 + .04 / 12) ** -(yrs * 12)) / (.04 / 12))(max(0, income * .55 - (flat_mo if flat_loan else 0)))
        def ok(P):
            loan = min(tiers[0] * P, ltdsr); duty = bsd(P) + .20 * P
            return cash >= tiers[1] * P + duty and cash + cpf >= P - loan + duty
        lo, hi = 0, 5e6
        for _ in range(60):
            m = (lo + hi) / 2; lo, hi = (m, hi) if ok(m) else (lo, m)
        return int(lo // 1000 * 1000)
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    opened(pg, '/tools/hdb-upgrade/')
    base = "n:1,p:[{age:35,fixed:%d,res:'SC'},{}],cash:%d,cpf:%d,homes:1,whose:'both',akind:'completed',bkind:'private',sale:{type:'hdb',price:750000,loan:250000,cpfRefund:205000},cpfBal:[{oa:%d,sa:250000},{}],ratePct:null,years:null"
    def eng(inc, cash, cpf, extra): return pg.evaluate("()=>{const a=GW_FIN3.afford({" + (base % (inc, cash, cpf, cpf)) + "," + extra + "});return a.state==='ok'?Math.floor(a.budget/1000)*1000:a.state}")
    e75 = eng(8000, 100000, 150000, "plan:'keep',loans:[]"); e45 = eng(8000, 100000, 150000, "plan:'keep',loans:[{type:'home',who:0,amt:1300}]")
    check('E1: the reported case, worked out independently: about $376,000 if the flat had no loan (75%), about $216,000 with its loan (45%, 25% cash)', bf_budget(100000, 150000, 8000, 35, False, 0) == 376000 and bf_budget(100000, 150000, 8000, 35, True, 1300) == 216000, [bf_budget(100000, 150000, 8000, 35, False, 0), bf_budget(100000, 150000, 8000, 35, True, 1300)])
    check('E1: the engine agrees: $376,000 without the loan, $216,000 with it', e75 == 376000 and e45 == 216000, [e75, e45])
    # income-bound: $4,000 a month and $400,000 cash, so TDSR (not cash) sets the loan and the flat's repayment must count
    t0 = eng(4000, 400000, 150000, "plan:'keep',loans:[{type:'home',who:0,amt:1300}]"); i0 = bf_budget(400000, 150000, 4000, 35, True, 1300); i1 = bf_budget(400000, 150000, 4000, 35, True, 0)
    check(f'E2: income-bound: the flat\'s $1,300 repayment lowers the budget (independent {i0:,} with it, {i1:,} if it were ignored); the engine gives {t0:,}', abs(t0 - i0) <= 1000 and i1 > i0, [t0, i0, i1])
    # the page: seed the journey's entries (cash, CPF, balances, the sale, the income), as Plan My Move would carry them
    raw = {'n': '1', 'p.0.age': '35', 'p.0.fixed': '8,000', 'cash': '100,000', 'cpf': '150,000', 'cpfBal.0.oa': '150,000', 'cpfBal.0.sa': '250,000', 'homes': '1', 'akind': 'completed', 'sale.type': 'hdb', 'sale.price': '750,000', 'sale.loan': '250,000', 'sale.cpfRefund': '205,000'}
    pg.evaluate("r=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:r,loans:[]}))}", raw)
    opened(pg, '/tools/hdb-upgrade/?j=1'); settle(pg)
    sell0 = pg.inner_text('[data-budget]'); se = pg.evaluate("()=>{const a=GW_FIN3.afford({" + (base % (8000, 100000, 150000, 150000)) + ",plan:'sell',loans:[]});return Math.floor(a.budget/1000)*1000}")
    pg.click('[data-bfirst] summary'); settle(pg)
    check('E3: the flat has a loan: the panel says the new loan is a second housing loan (45%, 25% cash) and asks for the flat\'s repayment beside its field; no buy-first budget yet', pg.is_visible('[data-bf-mo] [data-k="upFlatMo"]') and 'second housing loan: up to 45% of the price, at least 25% in cash' in pg.inner_text('[data-bfirst-out]') and pg.is_visible('[data-bf-need="upFlatMo"]') and not pg.query_selector('[data-bf-budget]'), pg.inner_text('[data-bfirst-out]')[:400])
    pg.fill('[data-k="upFlatMo"]', '1,300'); settle(pg)
    check('E3: with the $1,300 repayment typed: the buy-first budget is about $216,000, the figure worked out independently', amt(pg.inner_text('[data-bf-budget]')) == 216000 and 'counting its $1,300 monthly repayment' in pg.inner_text('[data-bfirst-out]'), pg.inner_text('[data-bfirst-out]')[-300:])
    check(f'E4: sell first is unchanged ({sell0}, the engine\'s sell-first budget)', pg.inner_text('[data-budget]') == sell0 and M(sell0) is not None and abs(M(sell0) - se) <= 10000, [sell0, se])
    pg.fill('[data-k="sale.loan"]', '0') if pg.locator('[data-k="sale.loan"]:visible').count() else pg.evaluate("()=>{const f=document.querySelector('[data-k=\"sale.loan\"]');f.value='0';f.dispatchEvent(new Event('input',{bubbles:true}))}")
    settle(pg)
    check('E5: a flat with no loan left: no repayment asked, the 75% limit, about $376,000', pg.is_hidden('[data-bf-mo]') and 'The flat has no loan left, so the usual 75% limit applies.' in pg.inner_text('[data-bfirst-out]') and amt(pg.inner_text('[data-bf-budget]')) == 376000, pg.inner_text('[data-bfirst-out]')[-300:])
    check('E: no script errors', not errs, errs)
    ctx.close()
    # ================= F. V3.7.3: typing a number never closes a step or loses the field (every numeric input, four calculators) =================
    # Each field is typed one key at a time, slower than the 120 ms recalculation, then checked: the whole number (with commas for money), still focused,
    # still visible. The cause of Ken's "$7" report was the Upgrade step opening and closing with the answers; it now closes only on Done.
    REVEAL_F = """k=>{const fs=[...document.querySelectorAll('[data-k="'+k+'"]')];let f=fs.find(x=>x.offsetParent&&!x.closest('details:not([open])'))||fs[0];if(!f)return false;
      const ste=f.closest('[data-ste]');if(ste&&ste.hidden){const c=document.querySelector('[data-stc="'+ste.dataset.ste+'"]');if(c&&c.offsetParent)c.click();}
      const pn=f.closest('[data-chp]');if(pn&&window.__f3OpenChip)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false;let d=f.closest('details');while(d){d.open=true;d=d.parentElement.closest('details')}return true}"""
    def typed_ok(pg, k, digits, money):
        pg.evaluate(REVEAL_F, k); pg.wait_for_timeout(120)
        f = pg.locator(f'[data-k="{k}"]:visible').first
        if not f.count(): return None
        f.click(); pg.keyboard.press('Control+A'); pg.keyboard.press('Delete'); pg.keyboard.type(digits, delay=140); pg.wait_for_timeout(260)
        want = f'{int(digits):,}' if money else digits
        return (f.input_value(), pg.evaluate("k=>!!document.activeElement&&document.activeElement.dataset.k===k&&!!document.activeElement.offsetParent", k), want)
    for tag, vp in (('desktop', {'width': 1440, 'height': 900}), ('phone', {'width': 390, 'height': 844})):
        ctx = br.new_context(viewport=vp, is_mobile=tag == 'phone', has_touch=tag == 'phone'); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        for path in ('/tools/hdb-upgrade/?j=1', '/tools/tdsr/', '/tools/payment-planner/', '/tools/sale-proceeds/'):
            opened(pg, path); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg)
            if 'hdb-upgrade' in path:   # every step answered (as on a returning visit), so each is reached through its Change; the buy-first fields are then shown too
                pg.evaluate("r=>sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:r,loans:[]}))", {'n': '1', 'p.0.age': '35', 'p.0.fixed': '8,000', 'homes': '1', 'sale.type': 'hdb', 'sale.price': '750,000', 'sale.loan': '250,000', 'sale.cpfRefund': '205,000'}); pg.reload(); ready(pg)
            if path == '/tools/payment-planner/': pg.fill('[data-k="price"]', '2,000,000'); settle(pg)
            keys = pg.evaluate("()=>[...new Set([...document.querySelectorAll('input[data-k][data-t=\"money\"],input[data-k][data-t=\"num\"]')].map(x=>x.dataset.k+'|'+x.dataset.t))]")
            bad, n = [], 0
            for kt in keys:
                k, tt = kt.split('|')
                if k in ('price2',) or k.startswith('cpfBal.1') or k.startswith('p.1.') and path != '/tools/tdsr/': continue
                digits = '35' if tt == 'num' and ('age' in k) else '25' if tt == 'num' and k in ('years', 'lease') else '3' if k == 'ratePct' else '12' if tt == 'num' else '750000'
                r = typed_ok(pg, k, digits, tt == 'money')
                pg.evaluate("()=>window.__f3OpenChip&&window.__f3OpenChip(null)")
                if r is None: continue
                n += 1
                if not (r[0] == r[2] and r[1]): bad.append((k, r))
            check(f'F {tag} {path}: every numeric field ({n}) takes a whole number typed key by key: shown in full (with commas), still focused and visible', n >= 3 and not bad, bad)
        # a housing loan's repayment (V3.12: in the person's own card, shown once a loan is chosen): typed key by key, kept
        opened(pg, '/tools/tdsr/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg); pg.fill('[data-inc] [data-k="p.0.fixed"]', '8,000'); settle(pg)
        pg.click('[data-k="p.0.hl"] [data-v="1"]'); pg.wait_for_selector('[data-k="p.0.hlAmt"]', state='visible')
        la = pg.locator('[data-k="p.0.hlAmt"]'); la.click(); pg.keyboard.type('1300', delay=150); pg.wait_for_timeout(300)
        check(f'F {tag} a housing loan’s repayment: $1,300 typed key by key, kept and focused', la.input_value() == '1,300' and pg.evaluate("document.activeElement.dataset.k") == 'p.0.hlAmt', la.input_value())
        # Upgrade: typing never completes a step; only Done does; Change reopens it; backspace, paste and clearing behave
        opened(pg, '/tools/hdb-upgrade/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg)
        f = pg.locator('[data-ste="worth"] [data-k="sale.price"]'); f.click(); pg.keyboard.type('750000', delay=160); pg.wait_for_timeout(300)
        check(f'F {tag} Upgrade step 1: $750,000 typed key by key; the step stays open and the field focused', f.input_value() == '750,000' and pg.is_visible('[data-ste="worth"]') and pg.evaluate("document.activeElement.dataset.k") == 'sale.price', f.input_value())
        pg.keyboard.press('Backspace'); pg.keyboard.press('Backspace'); pg.keyboard.press('Backspace'); pg.keyboard.type('500', delay=160); pg.wait_for_timeout(300)
        check(f'F {tag} backspace three digits and type 500: $750,500', f.input_value() == '750,500', f.input_value())
        pg.keyboard.press('Control+A'); pg.keyboard.insert_text('680000'); pg.wait_for_timeout(300)
        check(f'F {tag} select all and paste 680000: $680,000, still open', f.input_value() == '680,000' and pg.is_visible('[data-ste="worth"]'), f.input_value())
        pg.keyboard.press('Control+A'); pg.keyboard.press('Delete'); pg.wait_for_timeout(300)
        check(f'F {tag} clearing it: empty, no answer invented, still open', f.input_value() == '' and pg.is_visible('[data-ste="worth"]') and not errs, [f.input_value(), errs])
        pg.keyboard.type('750000', delay=60); settle(pg); pg.click('[data-stdone="worth"]'); settle(pg)
        check(f'F {tag} only Done completes step 1 (its answer shows) and opens step 2', pg.is_hidden('[data-ste="worth"]') and '$750,000' in pg.inner_text('[data-sta="worth"]') and pg.is_visible('[data-ste="sell"]'))
        for k, v in (('sale.loan', '250000'), ('sale.cpfRefund', '205000')):
            g = pg.locator(f'[data-ste="sell"] [data-k="{k}"]'); g.click(); pg.keyboard.type(v, delay=150)
        pg.wait_for_timeout(300)
        check(f'F {tag} step 2: loan and CPF used typed in full, focus moved between them; still open', pg.input_value('[data-ste="sell"] [data-k="sale.loan"]') == '250,000' and pg.input_value('[data-ste="sell"] [data-k="sale.cpfRefund"]') == '205,000' and pg.is_visible('[data-ste="sell"]'))
        pg.click('[data-stdone="sell"]'); settle(pg)
        for k, v in (('p.0.fixed', '8000'), ('p.0.age', '35')):
            g = pg.locator(f'[data-ste="borrow"] [data-k="{k}"]'); g.click(); pg.keyboard.type(v, delay=150)
        pg.wait_for_timeout(300); check(f'F {tag} step 3: income and age typed; still open until Done', pg.is_visible('[data-ste="borrow"]') and pg.input_value('[data-ste="borrow"] [data-k="p.0.fixed"]') == '8,000')
        pg.click('[data-stdone="borrow"]'); settle(pg); sell1 = pg.inner_text('[data-budget]')
        pg.click('[data-stc="worth"]'); pg.wait_for_timeout(200)
        check(f'F {tag} Change reopens step 1 with its figure, focused for editing', pg.is_visible('[data-ste="worth"]') and pg.input_value('[data-ste="worth"] [data-k="sale.price"]') == '750,000' and pg.evaluate("document.activeElement.dataset.k") == 'sale.price')
        pg.click('[data-stdone="worth"]'); settle(pg)
        # ================= G. V3.7.3: Buy first, then sell: three figures together, each asked for beside itself =================
        pg.click('[data-bfirst] summary'); settle(pg)
        check(f'G {tag} the three inputs sit together in the section, labelled as asked', all(pg.is_visible(f'[data-bfirst] [data-k="{k}"]') for k in ('upFlatMo', 'bfCash', 'bfCpf')) and all(x in pg.inner_text('[data-bfirst]') for x in ['Existing HDB monthly mortgage repayment', 'Available cash for the next purchase', 'Available usable CPF for the next purchase']))
        check(f'G {tag} nothing typed: each missing figure is asked for beside its own field; no budget invented', all(pg.is_visible(f'[data-bf-need="{k}"]') for k in ('upFlatMo', 'bfCash', 'bfCpf')) and pg.query_selector('[data-bf-wait]') is not None and not pg.query_selector('[data-bf-budget]'))
        for k, v in (('bfCash', '100000'), ('bfCpf', '150000')):
            g = pg.locator(f'[data-k="{k}"]'); g.click(); pg.keyboard.type(v, delay=120)
        settle(pg)
        check(f'G {tag} the repayment still blank: asked beside it, not taken as zero', pg.is_visible('[data-bf-need="upFlatMo"]') and pg.is_hidden('[data-bf-need="bfCash"]') and not pg.query_selector('[data-bf-budget]'))
        g = pg.locator('[data-k="upFlatMo"]'); g.click(); pg.keyboard.type('1300', delay=120); pg.wait_for_timeout(350)
        still = pg.evaluate("document.activeElement.dataset.k") == 'upFlatMo'; settle(pg)
        check(f'G {tag} Ken\'s case: $216,000 buy first (worked out independently, E1), updating as typed without losing the field; sell first unchanged ({sell1})', amt(pg.inner_text('[data-bf-budget]')) == 216000 and pg.inner_text('[data-budget]') == sell1 and still, [pg.inner_text('[data-bf-budget]'), pg.inner_text('[data-budget]'), still])
        pg.fill('[data-k="bfCash"]', '20,000'); settle(pg)
        check(f'G {tag} not enough cash: says so plainly, no figure', pg.query_selector('[data-bf-none]') is not None and 'leave nothing to buy with before the flat is sold' in pg.inner_text('[data-bfirst-out]'))
        pg.fill('[data-k="bfCash"]', '100,000'); settle(pg)
        pg.click('[data-stc="sell"]'); pg.wait_for_timeout(150); pg.fill('[data-ste="sell"] [data-k="sale.loan"]', '0'); settle(pg); pg.click('[data-stdone="sell"]'); settle(pg)
        check(f'G {tag} a fully paid flat: no repayment asked; the 75% limit; about $376,000', pg.is_hidden('[data-bf-mo]') and amt(pg.inner_text('[data-bf-budget]')) == 376000 and 'no loan left' in pg.inner_text('[data-bfirst-out]'), pg.inner_text('[data-bfirst-out]')[:200])
        sh = pg.evaluate("()=>{const h=GW_SHEET.mount(window.__f3Sheet());const m=h.querySelector('.gs-main');const r={fits:m.scrollHeight<=m.clientHeight+1,f1:(h.querySelector('[data-sheet-fig]')||{}).textContent};GW_SHEET.unmount();return r}")
        check(f'G {tag} Save as PDF still builds and fits, led by the sell-first budget', sh['fits'] and M(sh['f1'] or '') is not None, sh)
        check(f'F/G {tag} no script errors', not errs, errs)
        ctx.close()
    # journey: the guided journey's cash and CPF fill the buy-first fields once, to adjust
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    opened(pg, '/tools/hdb-upgrade/'); pg.evaluate("r=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:r,loans:[]}))}", {'n': '1', 'p.0.age': '35', 'p.0.fixed': '8,000', 'cash': '90,000', 'cpf': '120,000', 'homes': '1', 'sale.type': 'hdb', 'sale.price': '750,000', 'sale.loan': '250,000', 'sale.cpfRefund': '205,000'})
    opened(pg, '/tools/hdb-upgrade/?j=1'); settle(pg); pg.click('[data-bfirst] summary'); settle(pg)
    check('G Plan My Move: the journey\'s cash ($90,000) and CPF ($120,000) are already in the buy-first fields, to change as needed', pg.input_value('[data-k="bfCash"]') == '90,000' and pg.input_value('[data-k="bfCpf"]') == '120,000', [pg.input_value('[data-k="bfCash"]'), pg.input_value('[data-k="bfCpf"]')])
    ctx.close()
    # ================= C. layout: desktop, tablet, phone, 320px and 200% zoom =================
    for tag, vp, mob in (('1440', {'width': 1440, 'height': 900}, False), ('1060', {'width': 1060, 'height': 900}, False), ('tablet 820', {'width': 820, 'height': 1180}, True), ('phone 390', {'width': 390, 'height': 844}, True), ('phone 320', {'width': 320, 'height': 700}, True), ('200% zoom (195)', {'width': 195, 'height': 422}, True)):
        ctx = br.new_context(viewport=vp, is_mobile=mob, has_touch=mob); pg = ctx.new_page()
        for name, price, setup in (('new launch', '2,650,000', [('who', 'Permanent Resident'), ('who', 'Second home')]), ('HDB resale', '600,000', [('pkind', 'HDB resale flat')]), ('BTO', '500,000', [('pkind', 'New HDB flat')])):
            opened(pg, '/tools/payment-planner/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); ready(pg); fill(pg, 'price', price)
            for ch, t in setup: opt(pg, ch, t)
            bad = pg.evaluate(OVL)
            check(f'layout {tag}, {name}: no overlapping, clipped or overflowing text in the answer or the stages; no sideways scroll', not bad and not pg.evaluate("document.documentElement.scrollWidth>innerWidth+1"), bad)
        ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'\nv37-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
