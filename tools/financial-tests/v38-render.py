import os, pathlib, re, socket, subprocess, sys, time, json
from playwright.sync_api import sync_playwright
"""V3.8 (Ken, 27 Oct 2026): the seven-calculator directory and Pledged & Unpledged Assets. Desktop 1440, tablet 820 and phone 390.
Run from the site folder: python3 tools/financial-tests/v38-render.py
 D  Calculators: seven cards in Ken's order with his names and lines, two columns (one on a phone), equal heights, whole card a link, keyboard
    reachable; each opens its calculator; Plan My Move section leads to the journey; no Upgrade card, but tools/hdb-upgrade/ still works and
    Plan My Move still offers it; the header menu lists the same seven.
 P  Pledged & Unpledged Assets: figures equal those worked out by hand from MAS Notice 645 (see assets-tests.js for the rules), typed key by key
    without losing focus; the toggles, a price (LTV-bound), a target loan (needed / covered / above the limit); HDB and EC notes; standalone
    (reads no other calculator's figures, a new visit starts blank, a refresh restores); no figure in the address or analytics; no overflow."""
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
def M(s):
    m = re.search(r'\$([\d,]+)', s or ''); return int(m.group(1).replace(',', '')) if m else None
AF = lambda r, n: (1 - (1 + r / 12) ** (-n * 12)) / (r / 12)
rd = lambda x: int(x // 1000 * 1000)
SEVEN = [('payment-planner', 'Purchase Costs & Timeline', 'How much to pay, and when.'), ('tdsr', 'How Much Can I Borrow?', 'Housing loan estimate and TDSR.'),
         ('pledged-assets', 'Pledged & Unpledged Assets', 'Use financial assets to support your housing loan.'), ('mortgage', 'Mortgage Instalment', 'Monthly repayments and interest.'),
         ('sale-proceeds', 'Sale Proceeds', 'Cash and CPF after selling.'), ('stamp-duty', 'Buyer’s Stamp Duty', 'BSD and ABSD calculation.'), ('ssd', 'Seller’s Stamp Duty', 'Calculate SSD when selling.')]
def settled(pg): pg.wait_for_function("()=>window.__f3Settled&&window.__f3Settled()")
def page_ok(pg): pg.wait_for_selector('[data-out]'); settled(pg)
def typed(pg, k, text):   # key by key, at a person's pace, and the cursor never leaves the field
    f = pg.locator(f'[data-k="{k}"]'); f.click(); f.press('Control+a'); f.press('Delete'); f.type(text, delay=60); settled(pg)
    return pg.evaluate(f"()=>document.activeElement===document.querySelector('[data-k=\"{k}\"]')"), f.input_value()
def seg(pg, k, v): pg.click(f'[data-k="{k}"] [data-v="{v}"]'); settled(pg)
def overflow(pg): return pg.evaluate("()=>document.documentElement.scrollWidth-document.documentElement.clientWidth")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for tag, vp, mob in (('desktop', {'width': 1440, 'height': 900}, False), ('tablet', {'width': 820, 'height': 1180}, True), ('phone', {'width': 390, 'height': 844}, True)):
            ctx = br.new_context(viewport=vp, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            print(f'D {tag}: the Calculators page')
            pg.goto(B + '/tools/'); pg.wait_for_selector('.gw-tcs')
            cards = pg.evaluate("()=>[...document.querySelectorAll('.gw-tcs a.gw-tc')].map(a=>({id:a.dataset.tool,href:a.getAttribute('href'),t:a.querySelector('b').textContent,s:a.querySelector('span').textContent,r:a.getBoundingClientRect().toJSON()}))")
            check(f'{tag} D1: seven cards, in Ken\'s order, with his names and lines', [(c['id'], c['t'], c['s']) for c in cards] == SEVEN, [(c['id'], c['t']) for c in cards])
            check(f'{tag} D2: no Upgrade from HDB card, and no separate "advanced" or one-figure section', pg.locator('.gw-tcs [data-tool="hdb-upgrade"]').count() == 0 and 'Looking for one figure' not in pg.inner_text('main') and 'Advanced' not in pg.inner_text('main'))
            cols = len(set(round(c['r']['x']) for c in cards)); hs = [round(c['r']['height']) for c in cards]
            # Design Standard R1 (Ken, 28 Oct 2026): the Calculators grid spans the shared shell, three across from 1280px
            want_cols = {'desktop': 3, 'tablet': 2, 'phone': 1}[tag]
            check(f'{tag} D3: {["one column", "two columns", "three columns"][want_cols - 1]}, every card the same height' + (' (one column)' if tag == 'phone' else ''), cols == want_cols and (tag == 'phone' or len(set(hs)) == 1), [cols, hs])
            check(f'{tag} D4: each card has an icon and an arrow, and the whole card is the link', pg.evaluate("()=>[...document.querySelectorAll('.gw-tcs a.gw-tc')].every(a=>a.querySelectorAll('svg').length===2&&a.parentElement.tagName==='LI')"))
            check(f'{tag} D5: no sideways scrolling, no text clipped', overflow(pg) <= 0 and pg.evaluate("()=>[...document.querySelectorAll('.gw-tc b,.gw-tc span,.gw-pmm *')].every(e=>e.scrollWidth<=e.clientWidth+1)"), overflow(pg))
            pm = pg.locator('.gw-pmm')
            check(f'{tag} D6: "Planning your next property move?" under the cards, linking to Plan My Move', pm.count() == 1 and 'Buying, selling or upgrading? Use Plan My Move to connect your financial calculations across the journey.' in pm.inner_text() and pg.locator('.gw-pmm a').get_attribute('href') == '../journey/' and 'Explore Plan My Move' in pg.locator('.gw-pmm a').inner_text() and pm.bounding_box()['y'] > cards[-1]['r']['y'], pm.inner_text() if pm.count() else '')
            if tag == 'desktop':
                pg.focus('body'); seen = []
                for _ in range(40):
                    pg.keyboard.press('Tab'); a = pg.evaluate("()=>{const e=document.activeElement;return e&&e.closest('.gw-tcs')?e.dataset.tool:(e&&e.closest('.gw-pmm')?'pmm':null)}")
                    if a and a not in seen: seen.append(a)
                    if a == 'pmm': break
                check('D7: the keyboard reaches all seven cards in order, then Plan My Move', seen == [s[0] for s in SEVEN] + ['pmm'], seen)
                vis = pg.evaluate("()=>{const a=document.querySelector('.gw-tcs a');a.focus();return getComputedStyle(a).outlineStyle}"); check('D8: a focused card shows a focus ring', vis != 'none', vis)
                for sid, name, _ in SEVEN:
                    with pg.expect_navigation(): pg.click(f'.gw-tcs a[data-tool="{sid}"]')
                    pg.wait_for_load_state('domcontentloaded'); h1 = pg.inner_text('h1'); st = pg.evaluate("()=>location.pathname")
                    check(f'D9: {name} opens tools/{sid}/', st == f'/tools/{sid}/' and len(h1) > 3, [st, h1]); pg.go_back(); pg.wait_for_selector('.gw-tcs')
                with pg.expect_navigation(): pg.click('.gw-pmm a')
                pg.wait_for_load_state('domcontentloaded'); check('D10: Explore Plan My Move opens the journey, which still offers Upgrade from HDB', pg.evaluate("()=>location.pathname") == '/journey/' and 'Upgrade from HDB' in pg.inner_text('main'), pg.evaluate("()=>location.pathname"))
                pg.goto(B + '/tools/hdb-upgrade/'); pg.wait_for_selector('[data-f3="upgrade"]'); settled(pg)
                pg.fill('[data-k="sale.price"]', '750,000'); settled(pg)
                check('D11: the existing Upgrade from HDB address still works (its four steps, its calculation)', pg.locator('[data-step]').count() >= 3 and pg.locator('h1').inner_text() == 'Upgrade from HDB', pg.locator('h1').inner_text())
                pg.goto(B + '/'); menu = pg.evaluate("()=>[...document.querySelectorAll('.gw-ms-tools .gw-mi')].map(a=>a.dataset.gwNavTo)")
                check('D12: the header menu\'s Calculators column lists the same seven, in the same order', menu == [s[0] for s in SEVEN], menu)
                check('D13: the homepage\'s calculator line no longer lists Upgrade from HDB, and Plan My Move still does', 'Pledged & Unpledged Assets' in pg.inner_text('main') and pg.locator('main a[href="tools/hdb-upgrade/"]').count() == 1, pg.locator('main a[href="tools/hdb-upgrade/"]').count())
            check(f'{tag} D14: no script errors', not errs, errs)

            print(f'P {tag}: Pledged & Unpledged Assets')
            # standalone: another calculator's figures in this tab are not read
            pg.goto(B + '/tools/tdsr/'); pg.evaluate("()=>{sessionStorage.setItem('gw.fin3.v1',JSON.stringify({v:3,raw:{'p.0.fixed':'9,000','p.0.age':'40'},loans:[]}));sessionStorage.setItem('gw.fin.v1',JSON.stringify({'borrowers.0.fixed':'9,000','borrowers.0.age':'40'}))}")
            pg.goto(B + '/tools/pledged-assets/'); page_ok(pg)
            check(f'{tag} P1: a new visit starts blank, reading no other calculator\'s figures', all(pg.input_value(f'[data-k="{k}"]') == '' for k in ['value', 'fixed', 'age']) and 'Type your savings' in pg.text_content('[data-out]'))
            track = []; pg.expose_function('__t', lambda n, o: track.append([n, o]))
            pg.evaluate("()=>{const t=window.KPT&&KPT.track;if(window.KPT)KPT.track=function(n,o){window.__t(n,o||{});return t&&t.apply(this,arguments)}}")
            f1, v1 = typed(pg, 'value', '500000')
            check(f'{tag} P2: 500000 typed key by key: focus stays, commas appear, nothing closes', f1 and v1 == '500,000', [f1, v1])
            f2, v2 = typed(pg, 'fixed', '6000'); f3, v3 = typed(pg, 'age', '35')
            check(f'{tag} P3: income and age typed the same way', f2 and v2 == '6,000' and f3 and v3 == '35', [f2, v2, f3, v3])
            want, w0 = 0.55 * (6000 + 500000 / 48) * AF(.04, 30), 0.55 * 6000 * AF(.04, 30)
            o = pg.inner_text('[data-out]')
            check(f'{tag} P4: pledged cash $500,000: {rd(want):,} with, {rd(w0):,} without (worked by hand)', M(pg.inner_text('[data-cap]')) == rd(want) and M(pg.inner_text('[data-without]')) == rd(w0) and M(pg.inner_text('[data-extra]')) == rd(want) - rd(w0), o[:300])
            check(f'{tag} P5: the asset income shown: $10,417 a month, "in full, spread over 48 months"', M(pg.inner_text('[data-asset-mo]')) == 10417 and 'in full, spread over 48 months' in o, o)
            check(f'{tag} P6: the pledge and unpledged difference said in one line; the money can\'t also pay the down payment', 'Kept unpledged, it would add $360,000' in o and 'can’t also pay the down payment' in o, o)
            seg(pg, 'pledged', '0'); o = pg.inner_text('[data-out]'); wu = 0.55 * (6000 + 150000 / 48) * AF(.04, 30)
            check(f'{tag} P7: unpledged: 70% off, so {rd(wu):,}', M(pg.inner_text('[data-cap]')) == rd(wu) and 'less 70%' in o and 'must still be in your account' in o, o[:400])
            seg(pg, 'kind', 'other'); seg(pg, 'pledged', '1'); wo = 0.55 * (6000 + 350000 / 48) * AF(.04, 30)
            check(f'{tag} P8: investments pledged: 30% off, so {rd(wo):,}', M(pg.inner_text('[data-cap]')) == rd(wo) and 'less 30%' in pg.inner_text('[data-out]'))
            seg(pg, 'kind', 'cash'); f4, _ = typed(pg, 'debts', '1500'); wd = (0.55 * (6000 + 500000 / 48) - 1500) * AF(.04, 30)
            check(f'{tag} P9: $1,500 of repayments comes off: {rd(wd):,}', f4 and M(pg.inner_text('[data-cap]')) == rd(wd))
            typed(pg, 'debts', '')
            if not pg.locator('[data-tgt]').evaluate('e=>e.open'): pg.click('[data-tgt] summary')
            typed(pg, 'price', '800000'); o = pg.inner_text('[data-out]')
            check(f'{tag} P10: an $800,000 home: the 75% limit ($600,000) already within the income test, so the assets add $0 and it says so', M(pg.inner_text('[data-cap]')) == 600000 and M(pg.inner_text('[data-without]')) == 600000 and pg.inner_text('[data-extra]').strip() == '$0' and 'don’t raise the loan for this home' in o, o[:500])
            typed(pg, 'price', '1000000'); o = pg.inner_text('[data-out]')
            check(f'{tag} P11: a $1M home: the assets lift the loan only to $750,000; down payment $250,000, at least $50,000 cash', M(pg.inner_text('[data-cap]')) == 750000 and 'up to the 75% loan limit' in o and '$250,000' in o and '$50,000 in cash' in o, o[:600])
            seg(pg, 'homeLoans', '1')
            check(f'{tag} P12a: a housing loan still running: its repayment field appears and is asked for; no figure until it is in', pg.locator('[data-k="homeDebts"]').is_visible() and pg.locator('[data-need-hd]').is_visible() and pg.locator('[data-cap]').count() == 0, pg.text_content('[data-out]')[:200])
            typed(pg, 'homeDebts', '1300'); o = pg.inner_text('[data-out]')
            check(f'{tag} P12: a second housing loan: 45% of $1M = $450,000', M(pg.inner_text('[data-cap]')) == 450000 and '45% of $1,000,000' in o, o[:500])
            seg(pg, 'homeLoans', '0'); typed(pg, 'target', '900000')
            check(f'{tag} P13: a $900,000 loan on a $1M home: no amount of assets reaches it', pg.locator('[data-tgt-state="ltv"]').count() == 1, pg.inner_text('[data-tgt-out]'))
            typed(pg, 'price', ''); typed(pg, 'target', '1000000'); need = (1e6 / AF(.04, 30) / .55 - 6000) * 48
            got = M(pg.inner_text('[data-tgt-need]') if pg.locator('[data-tgt-need]').count() else '')
            check(f'{tag} P14: a $1M loan: about ${need:,.0f} of pledged cash (worked by hand), and "enough" for the $500,000 entered', got is not None and 0 <= got - need < 1000 and 'which is enough' in pg.inner_text('[data-tgt-out]'), [got, need, pg.inner_text('[data-tgt-out]')])
            typed(pg, 'value', '50000'); short = pg.inner_text('[data-tgt-out]')
            check(f'{tag} P15: with $50,000 entered, how much more is needed', f'about ${got - 50000:,} more' in short, short)
            typed(pg, 'target', '600000'); check(f'{tag} P16: a $600,000 loan the income already supports: no assets needed', pg.locator('[data-tgt-state="covered"]').count() == 1)
            typed(pg, 'target', ''); typed(pg, 'value', '500000')
            seg(pg, 'prop', 'hdb'); w_h = min(.3, .55) * (6000 + 500000 / 48) * AF(.04, 25)
            check(f'{tag} P17: HDB flat with a bank loan: 30% MSR over 25 years ({rd(w_h):,}); says HDB loans are HDB\'s own', M(pg.inner_text('[data-cap]')) == rd(w_h) and 'HDB assesses its own loans' in pg.inner_text('form'), pg.inner_text('[data-out]')[:300])
            seg(pg, 'prop', 'private'); pg.click('[data-as] summary') if not pg.locator('[data-as]').evaluate('e=>e.open') else None
            typed(pg, 'ratePct', '5'); w5 = 0.55 * (6000 + 500000 / 48) * AF(.05, 30)
            check(f'{tag} P18: a 5% rate is tested at 5%: {rd(w5):,}', M(pg.inner_text('[data-cap]')) == rd(w5))
            typed(pg, 'ratePct', ''); typed(pg, 'years', '20'); w20 = 0.55 * (6000 + 500000 / 48) * AF(.04, 20)
            check(f'{tag} P19: a 20-year tenure: {rd(w20):,}', M(pg.inner_text('[data-cap]')) == rd(w20)); typed(pg, 'years', '')
            typed(pg, 'age', ''); check(f'{tag} P20: age cleared: it asks for the age, no figure', 'Add your age' in pg.text_content('[data-out]') and pg.locator('[data-cap]').count() == 0)
            typed(pg, 'age', '35'); typed(pg, 'value', '12a'); check(f'{tag} P21: a figure that isn\'t a number is said beside the field', pg.locator('[data-err="value"]').is_visible() and 'Check the figures' in pg.text_content('[data-out]'))
            typed(pg, 'value', '500000')
            check(f'{tag} P22: the address carries no figure; analytics carry only the tool\'s name', '500' not in pg.url and '6000' not in pg.url and all(set(o.keys()) <= {'tool_name'} for n, o in track) and any(n == 'tool_started' for n, o in track), [pg.url, track])
            pg.reload(); page_ok(pg)
            check(f'{tag} P23: a refresh brings this page\'s own figures back', pg.input_value('[data-k="value"]') == '500,000' and M(pg.inner_text('[data-cap]')) == rd(want))
            check(f'{tag} P24: no sideways scrolling; the figures fit', overflow(pg) <= 0 and pg.evaluate("()=>[...document.querySelectorAll('.f3-af')].every(e=>e.scrollWidth<=e.clientWidth+2)"), overflow(pg))
            if tag == 'phone':
                pg.evaluate("()=>window.scrollTo(0,0)"); pg.wait_for_function("()=>{const b=document.querySelector('[data-bar]');return b&&!b.hidden&&b.classList.contains('f3-bar-on')}")
                check('P25: phone: the answer bar shows the figure while the card is off screen', M(pg.inner_text('[data-bar]')) == rd(want), pg.inner_text('[data-bar]'))
            # V3.8.1 (Notice 645 para 6(f) and 9): a $1,300 home loan and a $700 car loan; $8,000, 35, $500,000 cash; MSR counts the $1,300 only, TDSR both
            pg.goto(B + '/tools/pledged-assets/'); page_ok(pg)
            check(f'{tag} P28: the page says up front it is for one borrower and one kind of asset at a time', 'for one borrower and one kind of asset at a time' in pg.inner_text('.gw-calc-hero'))
            typed(pg, 'value', '500000'); typed(pg, 'fixed', '8000'); typed(pg, 'age', '35'); seg(pg, 'homeLoans', '1'); typed(pg, 'homeDebts', '1300'); typed(pg, 'debts', '700')
            for prop, af in (('hdb', AF(.04, 25)), ('ec', AF(.04, 30))):
                seg(pg, 'prop', prop)
                for pl in ('1', '0'):
                    seg(pg, 'pledged', pl); inc = 8000 + (500000 if pl == '1' else 150000) / 48; want = min(.30 * inc - 1300, .55 * inc - 2000) * af
                    pg.click('[data-why] summary') if not pg.locator('[data-why]').evaluate('e=>e.open') else None
                    w = pg.inner_text('[data-why-out]')
                    check(f'{tag} P29: {"HDB flat, bank loan" if prop == "hdb" else "new EC"}, {"pledged" if pl == "1" else "unpledged"}: {rd(want):,} (30% less the $1,300 home loan; 55% less all $2,000)', M(pg.inner_text('[data-cap]')) == rd(want) and 'less the $1,300 on the loan still running' in w and 'less the $2,000 you repay in all' in w and 'Car and other loans count only in the 55%' in w, [pg.inner_text('[data-cap]'), rd(want), w[:400]])
            seg(pg, 'pledged', '1')
            pg.goto(B + '/tools/tdsr/'); page_ok(pg)
            check(f'{tag} P26: How much can I borrow? shows nothing typed here (independent)', pg.input_value('[data-k="p.0.fixed"]') == '')
            check(f'{tag} P27: no script errors', not errs, errs)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'v38-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
