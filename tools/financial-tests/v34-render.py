import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""FE V3.4 (26 Oct 2026): the calculator set finished as one frame. Desktop 1440 and phone 390. Run from the site folder: python3 tools/financial-tests/v34-render.py
 1. What will I get from selling?: the total shows before any CPF figure, the cash/CPF split once it is entered; Ken's example ($750,000, $250,000 owing,
    $205,000 CPF) gives $480,650 / $275,650 / $205,000; chips show their consequence; SSD is a line when the dates say it applies; the Value Explorer's
    resales pre-fill the price; "What can this buy me next?" opens How much can I borrow? with the sale counted.
 2. Upgrade from HDB: four steps, one answer each, Change reopens a step, figures carry forward and nothing is asked twice; the budget card shows
    KPT assumptions; a reserve lowers the budget; buy-first is explained.
 3. How much can I borrow?: "Add my cash and CPF" gives a budget; bonus is typed as a year (divided by 12); the HDB chip asks household and lease
    and flags the singles' age; the old addresses (planner, msr) arrive there.
 4. The Calculators page and the header menu: four questions, then stamp duty, mortgage instalment and SSD as text links; search still finds the old names.
 5. Every page: a card with a judgement sentence, Save as PDF giving one A4 page, the phone bar only once the card is out of view, no sideways scroll,
    nothing typed in the address, analytics events from the existing names only and never a figure."""
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
money = lambda s: int(re.sub(r'[^0-9]', '', s)) if s and re.search(r'\d', s) else None
EVENTS = {'tool_started', 'tool_completed', 'pdf_saved', 'fin3_fresh', 'fin3_fund_open', 'tool_selected', 'nav_click', 'page_view', 'search_used', 'search_select', 'menu_open', 'wa_click', 'journey_click', 'cta_click'}
SPY = "()=>{window.__ev=[];const K=window.KPT=window.KPT||{};const t=K.track;K.track=function(n,p){window.__ev.push([n,JSON.stringify(p||{})]);try{return t&&t.apply(K,arguments)}catch(e){}}}"
def settle(pg):
    pg.wait_for_function("()=>!window.__f3Settled||window.__f3Settled()"); pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.wait_for_timeout(250)
def fresh(pg, path):
    pg.goto(B + path); pg.wait_for_selector('[data-out]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]'); pg.evaluate(SPY)
def out(pg): return pg.inner_text('[data-out]')
def common(pg, tag, name):
    # the card's judgement, the PDF sheet on one page, no sideways scroll, the address free of figures
    check(f'{tag} {name}: a judgement sentence on the card', (pg.inner_text('[data-out] .f3-fact') or '').strip() != '')
    check(f'{tag} {name}: Save as PDF is the last row of the card', pg.evaluate("()=>{const b=document.querySelector('[data-save-pdf]');return !!b&&!b.hidden&&!b.nextElementSibling}"))
    fit = pg.evaluate("()=>{const h=GW_SHEET.mount(window.__f3Sheet());const m=h.querySelector('.gs-main');const r={fits:m.scrollHeight<=m.clientHeight+1,foot:h.querySelector('[data-sheet-foot-left]').textContent,figs:[...h.querySelectorAll('.gs-figs [data-sheet-fig]')].map(x=>x.textContent)};GW_SHEET.unmount();return r}")
    check(f'{tag} {name}: the PDF sheet fits one A4 page, with the exact footer', fit['fits'] and fit['foot'] == 'Ken Tan · The Property Guy — Property agent since 2007 · CEA R007903D · Huttons Asia Pte Ltd (L3008899K) · WhatsApp 9090 8898 · tools.kentanthepropertyguy.com', fit)
    check(f'{tag} {name}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1"))
    check(f'{tag} {name}: no figure in the address', not re.search(r'\d{3}', pg.url.split('?')[-1].split('#')[-1] if ('?' in pg.url or '#' in pg.url) else ''), pg.url)
    return fit
def events_ok(pg, tag, name):
    ev = pg.evaluate("window.__ev||[]")
    check(f'{tag} {name}: analytics only from the existing event names, with no figure in them', all(e[0] in EVENTS and not re.search(r'\d{4}', e[1]) for e in ev), ev)
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        print('--', tag)
        # ---- 1. selling ----
        fresh(pg, '/tools/sale-proceeds/')
        pg.fill('[data-k="sale.price"]', '750,000'); pg.fill('[data-k="sale.loan"]', '250,000'); settle(pg)
        t = out(pg)
        check(f'{tag} sell: the total shows before any CPF figure ($480,650)', money(pg.inner_text('[data-total]')) == 480650 and pg.query_selector('[data-cash]') is None and 'Add the CPF used' in t, t[:200])
        pg.evaluate("window.__f3OpenChip('scomm')"); subs = pg.evaluate("[...document.querySelectorAll('[data-optl=\"scomm\"] .f3-os')].map(x=>x.textContent)")
        check(f'{tag} sell: the agent chip shows what each fee leaves you', len(subs) >= 3 and all(s.startswith('You get back $') for s in subs[:3]), subs)
        pg.evaluate("window.__f3OpenChip(null)")
        pg.evaluate("window.__f3OpenChip('scpf','sale.cpfRefund')"); pg.fill('[data-k="sale.cpfRefund"]', '205,000'); pg.keyboard.press('Enter'); settle(pg)
        check(f'{tag} sell: Ken’s example splits into $275,650 cash and $205,000 CPF', money(pg.inner_text('[data-cash]')) == 275650 and money(pg.inner_text('[data-cpf]')) == 205000 and money(pg.inner_text('[data-total]')) == 480650)
        j = pg.inner_text('[data-out] .f3-fact')
        check(f'{tag} sell: the judgement says the 5% cash comes from the cash line, not the CPF refund', '5%' in j and '$275,650' in j and 'CPF' in j, j)
        check(f'{tag} sell: one Ask Ken (the header’s)', pg.evaluate("[...document.querySelectorAll('main a,main button')].filter(a=>/Ask Ken/i.test(a.textContent)).length") == 0)
        common(pg, tag, 'sell')
        if tag == 'phone':
            pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(300); inview = pg.evaluate("document.querySelector('[data-bar]').classList.contains('f3-bar-on')")
            pg.evaluate("window.scrollTo(0,document.body.scrollHeight)"); pg.wait_for_timeout(400); away = pg.evaluate("()=>{const b=document.querySelector('[data-bar]');const r=document.querySelector('.f3-out').getBoundingClientRect();return {on:b.classList.contains('f3-bar-on'),cardGone:r.bottom<0||r.top>innerHeight}}")
            check(f'{tag} sell: the bar appears only once the card is out of view', not inview and (away['on'] == away['cardGone']), [inview, away])
        # SSD: a private home bought in Jan 2024 (3-year period, 4% in the third year), sold today
        pg.evaluate("window.__f3OpenChip('stype')"); pg.click('[data-optl="stype"] .f3-opt:nth-child(2)'); settle(pg)
        pg.evaluate("window.__f3OpenChip('sssd','sale.bought')"); pg.fill('[data-k="sale.bought"]', '2024-01-15'); pg.fill('[data-k="sale.sold"]', '2026-10-26'); pg.keyboard.press('Enter'); settle(pg)
        check(f'{tag} sell: SSD is a line when the dates say it applies (4% of $750,000)', money(pg.inner_text('[data-ssd]') if pg.query_selector('[data-ssd]') else '') == 30000 and money(pg.inner_text('[data-total]')) == 450650, out(pg)[:300])
        pg.evaluate("window.__f3OpenChip('sssd')"); pg.click('[data-optl="sssd"] .f3-opt:nth-child(1)'); settle(pg)
        check(f'{tag} sell: owned long enough, no SSD line', pg.query_selector('[data-ssd]') is None and money(pg.inner_text('[data-total]')) == 480650)
        pg.evaluate("window.__f3OpenChip('stype')"); pg.click('[data-optl="stype"] .f3-opt:nth-child(1)'); settle(pg)
        events_ok(pg, tag, 'sell')
        # the hand-off to the borrowing page: the sale is counted in "Add my cash and CPF"
        pg.click('[data-to-borrow]'); pg.wait_for_selector('[data-f3="borrow"]'); pg.fill('[data-k="p.0.fixed"]', '8,000'); settle(pg)
        t = out(pg)
        check(f'{tag} sell → borrow: the row is open and the sale is counted in a budget', pg.evaluate("document.querySelector('[data-cashrow]').open") and pg.query_selector('[data-budget]') is not None and 'Counts your home’s sale' in t, t[:300])
        # the Value Explorer's resales for the block pre-fill the selling price
        pg.goto(B + '/tools/stamp-duty/'); pg.evaluate("sessionStorage.clear();sessionStorage.setItem('gw.ctx.v1',JSON.stringify({v:1,type:'hdb',hdb:{town:'TAMPINES',block:'123',street:'TAMPINES ST 11',flatType:'4 ROOM',n:9,lo:720000,hi:780000}}))")
        pg.goto(B + '/tools/sale-proceeds/?j=1'); pg.wait_for_selector('[data-out]'); settle(pg)
        check(f'{tag} sell (Plan My Move): the price comes from the Value Explorer, with its resales beside it', pg.input_value('[data-k="sale.price"]') == '750,000' and 'Blk 123' in pg.inner_text('[data-blockhint]'), [pg.input_value('[data-k="sale.price"]')])
        # ---- 2. Upgrade from HDB ----
        pg.goto(B + '/tools/hdb-upgrade/?j=1'); pg.wait_for_selector('[data-out]'); pg.evaluate(SPY); settle(pg)
        check(f'{tag} upgrade (Plan My Move): step 1 carries the Value Explorer’s range; step 2 is the one open', 'Blk 123' in pg.inner_text('[data-step="worth"]') and pg.is_visible('[data-ste="sell"]') and not pg.is_visible('[data-ste="borrow"]'))
        pg.fill('[data-ste="sell"] [data-k="sale.loan"]', '250,000'); pg.fill('[data-ste="sell"] [data-k="sale.cpfRefund"]', '205,000'); settle(pg); (pg.is_visible('[data-stdone="sell"]') and pg.click('[data-stdone="sell"]')); settle(pg)   # a step closes itself once answered
        check(f'{tag} upgrade: step 2 answers $480,650 with the cash and CPF', '$480,650' in pg.inner_text('[data-step="sell"]') and '$275,650 cash + $205,000 CPF' in pg.inner_text('[data-step="sell"]'))
        pg.fill('[data-ste="borrow"] [data-k="p.0.fixed"]', '8,000'); pg.fill('[data-ste="borrow"] [data-k="p.0.age"]', '35'); settle(pg); (pg.is_visible('[data-stdone="borrow"]') and pg.click('[data-stdone="borrow"]')); settle(pg)   # a step closes itself once answered
        b1 = money(pg.inner_text('[data-budget]').replace('M', '0000').replace('.', '')) if pg.query_selector('[data-budget]') else None
        t = out(pg)
        check(f'{tag} upgrade: the budget card shows buy up to, upfront and reserve, with KPT assumptions', b1 and 'Upfront it needs' in t and 'Left in reserve' in t and 'KPT assumptions' in t, t[:300])
        sh = pg.evaluate("window.__f3Sheet()")
        check(f'{tag} upgrade: the budget equals the engine’s (sheet and card from one result)', sh and sh['figures'][0]['value'].replace('S$', '$') == pg.inner_text('[data-budget]'), [sh and sh['figures'][0], pg.inner_text('[data-budget]')])
        check(f'{tag} upgrade: nothing asked twice (each entry appears once)', pg.evaluate("['sale.price','sale.loan','sale.cpfRefund','p.0.fixed','p.0.age'].every(k=>document.querySelectorAll('[data-k=\"'+k+'\"]').length===1)"))
        pg.click('[data-stc="sell"]'); settle(pg)
        check(f'{tag} upgrade: Change reopens a step', pg.is_visible('[data-ste="sell"]'))
        pg.fill('[data-ste="sell"] [data-k="sale.loan"]', '300,000'); settle(pg); (pg.is_visible('[data-stdone="sell"]') and pg.click('[data-stdone="sell"]')); settle(pg)   # a step closes itself once answered
        b2 = pg.inner_text('[data-budget]')
        check(f'{tag} upgrade: changing a step updates the budget', b2 != sh['figures'][0]['value'].replace('S$', '$'), [b2])
        # V3.5: funds kept aside are an assumption chip, "None" by default; a custom amount recalculates the budget
        check(f'{tag} upgrade: no funds are kept aside by default', 'Keep funds aside: None' in pg.inner_text('[data-chip="ures"]') and money(pg.inner_text('[data-reserve]')) < 1000)
        pg.evaluate("window.__f3OpenChip('ures','reserve')"); pg.wait_for_timeout(200); pg.locator('[data-optl="ures"] .f3-opt', has_text='Another amount').first.click(); pg.locator('[data-k="reserve"]:visible').first.fill('50,000'); pg.keyboard.press('Enter'); settle(pg)
        check(f'{tag} upgrade: funds kept aside are left out of the budget', money(pg.inner_text('[data-reserve]')) >= 50000 and pg.inner_text('[data-budget]') != b2 and 'Keep funds aside: $50k' in pg.inner_text('[data-chip="ures"]'), pg.inner_text('[data-chip="ures"]'))
        check(f'{tag} upgrade: buy first, then sell is explained', 'ABSD' in pg.evaluate("document.querySelector('[data-bfirst-out]').textContent"))
        common(pg, tag, 'upgrade'); events_ok(pg, tag, 'upgrade')
        # ---- 3. borrowing with cash and CPF; annual bonus; HDB chip ----
        fresh(pg, '/tools/tdsr/')
        pg.fill('[data-k="p.0.fixed"]', '8,000'); pg.click('[data-var] > summary'); pg.fill('[data-k="p.0.bonusYr"]', '24,000'); settle(pg)
        why = pg.evaluate("document.querySelector('[data-why-out]').textContent")
        check(f'{tag} borrow: bonus typed as a year is counted a month (24,000 / 12 = 2,000 at 70%)', '$10,000 a month' in why and '$9,400' in why, why[:200])
        pg.click('[data-cashrow] > summary'); pg.fill('[data-k="cash"]', '200,000'); pg.fill('[data-k="cpf"]', '150,000'); settle(pg)
        check(f'{tag} borrow: "Add my cash and CPF" turns the loan into a budget and says what limits it', pg.query_selector('[data-budget]') is not None and re.search(r'(cash and CPF are the limit|The loan is the limit)', pg.inner_text('[data-out] .f3-fact')) is not None)
        common(pg, tag, 'borrow with cash')
        pg.evaluate("window.__f3OpenChip('bkind')"); pg.click('[data-optl="bkind"] .f3-opt:nth-child(2)'); settle(pg)
        pg.evaluate("window.__f3OpenChip('bkind')"); ol = pg.inner_text('[data-optl="bkind"]')
        pg.locator('[data-optl="bkind"] .f3-opt', has_text='Remaining lease').click(); pg.wait_for_timeout(150)
        check(f'{tag} borrow: the HDB chip asks the household (with HDB’s ceilings) and the remaining lease', 'applying for the hdb loan as' in ol.lower() and '$8,000 a month' in ol and pg.is_visible('[data-k="lease"]'), [ol.replace(chr(10),' | ')[:500], pg.is_visible('[data-k="lease"]'), pg.inner_text('[data-chip-l="bkind"]')])
        pg.locator('[data-optl="bkind"] .f3-opt', has_text='Single, 35').click(); pg.wait_for_timeout(150); pg.evaluate("window.__f3OpenChip(null)"); pg.evaluate("window.__f3OpenChip('age','p.0.age')"); pg.fill('[data-chp="age"] [data-k="p.0.age"]', '32'); pg.keyboard.press('Enter'); settle(pg)
        check(f'{tag} borrow: a single under 35 is flagged, as the HDB and EC loan limit page did', pg.query_selector('[data-elig="age"]') is not None and 'if eligible' in out(pg))
        events_ok(pg, tag, 'borrow')
        for old, want in [('/tools/planner/', '/tools/tdsr/#cash'), ('/tools/msr/', '/tools/tdsr/#hdb'), ('/tools/msr/#ec', '/tools/tdsr/#ec'), ('/tools/planner/#sell', '/tools/hdb-upgrade/')]:
            pg.goto(B + old); pg.wait_for_selector('[data-f3]'); check(f'{tag} old address {old} opens {want}', pg.url.endswith(want), pg.url)
        # ---- 4. the Calculators page and the header menu ----
        pg.goto(B + '/tools/'); pg.wait_for_timeout(300)
        # V3.8 (Ken 27 Oct 2026): seven equal calculator cards replace the four questions and the text links; the menu lists the same seven (v38-render covers the rest)
        SEVEN = [['Purchase Costs & Timeline', 'payment-planner/'], ['How Much Can I Borrow?', 'tdsr/'], ['Pledged & Unpledged Assets', 'pledged-assets/'], ['Mortgage Instalment', 'mortgage/'], ['Sale Proceeds', 'sale-proceeds/'], ['Buyer’s Stamp Duty', 'stamp-duty/'], ['Seller’s Stamp Duty', 'ssd/']]
        cards = pg.evaluate("[...document.querySelectorAll('.gw-tdir .gw-tc')].map(a=>[a.querySelector('b').textContent,a.getAttribute('href')])")
        check(f'{tag} calculators: the seven, in order', cards == SEVEN, cards)
        check(f'{tag} calculators: no Upgrade card and no text links underneath', pg.locator('.gw-tdir .gw-mone').count() == 0 and not any(c[1] == 'hdb-upgrade/' for c in cards))
        col = pg.evaluate("[...document.querySelectorAll('.gw-ms-tools .gw-mi b')].map(b=>b.textContent)")
        check(f'{tag} header menu: the same seven', col == [c[0] for c in SEVEN], col)
        check(f'{tag} no script errors', not errs, errs[:3])
        ctx.close()
    br.close()
finally:
    srv.terminate()
# search still finds the folded pages by their old names
G = str(SITE / 'assets/js/gw-nav.js')
r = subprocess.run(['node', '-e', "global.self=global;const g=require(%s);const f=(q)=>g.ENTRIES.filter(e=>(e.t||[]).concat([e.name.toLowerCase()]).some(t=>t.indexOf(q)>=0)).map(e=>e.href);console.log(JSON.stringify({afford:f('what can i afford'),msr:f('msr'),sale:f('sale proceeds'),up:f('hdb upgrade')}))" % json.dumps(G)], capture_output=True, text=True)
S = json.loads(r.stdout)
check('search: "what can i afford" finds the borrowing page with the cash row', 'tools/tdsr/#cash' in S['afford'], S)
check('search: "msr" finds the borrowing page set for HDB', 'tools/tdsr/#hdb' in S['msr'], S)
check('search: "sale proceeds" finds What will I get from selling?', 'tools/sale-proceeds/' in S['sale'], S)
check('search: "hdb upgrade" finds Upgrade from HDB', 'tools/hdb-upgrade/' in S['up'], S)
print('v34-render: %d passed, %d failed' % (ok, fail)); sys.exit(1 if fail else 0)
