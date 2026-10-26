import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Calculator consolidation and Tools directory (24 Oct 2026). Run from the site folder:  python3 tools/financial-tests/consolidation-render.py
1. Every All Tools card opens the tool it names; the HDB upgrading line opens the four-step journey; search still finds HDB upgrade, TDSR, ABSD and Full payment planning.
2. The old HDB upgrade planner address opens What can I afford? set up for a flat being sold, on step 3 of the upgrade path, with the old figures carried over.
3. The Payment timeline's monthly-instalment warning: not shown merely because no monthly amount was entered; a payment shortfall, and an instalment gap after
   monthly amounts were entered, still warn; the estimated monthly mortgage stays visible in every case.
4. Desktop and phone: no sideways scroll, no script errors."""
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
CARDS = {'payment-planner': '/tools/payment-planner/', 'tdsr': '/tools/tdsr/', 'sale-proceeds': '/tools/sale-proceeds/', 'hdb-upgrade': '/tools/hdb-upgrade/', 'mortgage': '/tools/mortgage/', 'stamp-duty': '/tools/stamp-duty/', 'ssd': '/tools/ssd/'}
def timeline(pg, kind, fills, price='1,500,000'):
    # FE V3: the Payment timeline is one page: type, price and date, then the funding check opened on the same page (no tabs)
    pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-f3="pay"]'); pg.evaluate("sessionStorage.removeItem('gw.fin3.v1')"); pg.reload(); pg.wait_for_selector('[data-f3="pay"]')
    pg.evaluate("k=>document.querySelector('[data-k=\"pkind\"] button[data-v=\"'+k+'\"]').click()", kind)
    # FE V3.3: the date, the schedule and the funding check sit behind "All payments"
    pg.fill('[data-k="price"]', price); pg.evaluate("()=>window.__f3AllPay(true)"); pg.fill('[data-k="otp"]', '2026-11-01')
    pg.evaluate("()=>{document.querySelector('[data-fund]').open=true;document.querySelectorAll('[data-fund] details').forEach(d=>d.open=true)}")
    # FE V3.2: entries behind an assumption chip are opened, typed and closed again
    REVEAL = r'''k=>{const f=document.querySelector('[data-k="'+k+'"]');if(!f||(f.checkVisibility?f.checkVisibility():f.offsetParent))return false;const pn=f.closest('[data-chp]');if(pn&&window.__f3OpenChip)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false;const d=f.closest('details');if(d)d.open=true;return !!pn}'''
    for k, v in fills:
        key = {'borrowers.0.fixed': 'p.0.fixed', 'borrowers.0.age': 'p.0.age'}.get(k, k); opened = pg.evaluate(REVEAL, key)
        pg.locator('[data-k="%s"]' % key).first.fill(v)
        if opened: pg.evaluate("()=>window.__f3OpenChip(null)")
    pg.wait_for_function("()=>window.__f3Settled&&window.__f3Settled()&&!!document.querySelector('[data-fund-out] .pl-st')", timeout=8000)
    st = pg.query_selector('[data-fund-out] .pl-st'); mo = pg.query_selector('[data-fund-out] .pl-sf-w')
    return (st.get_attribute('class') if st else ''), (st.inner_text() if st else ''), (mo.inner_text() if mo else '')
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        # ---- 1. the Calculators page (V3.4: four questions, then the single-figure calculators as text links)
        pg.goto(B + '/tools/'); pg.wait_for_selector('.gw-tdir'); pg.wait_for_timeout(300)
        check(vn + ': four question cards, each once, no badges', pg.locator('.gw-tdir a.gw-tl').count() == 4 and pg.locator('.gw-tdir a.gw-tl em').count() == 0)
        check(vn + ': Stamp duty, Mortgage instalment and Seller’s stamp duty as text links', pg.locator('.gw-tdir .gw-mone a').count() == 3)
        check(vn + ': no sideways scroll on the Calculators page', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        for tool, path in CARDS.items():
            pg.goto(B + '/tools/'); pg.wait_for_selector('.gw-tdir'); pg.click('.gw-tdir a[data-tool="%s"]' % tool); pg.wait_for_load_state(); pg.wait_for_timeout(200)
            check(vn + ': the ' + tool + ' link opens ' + path + ' as a standalone tool', pg.url.split('#')[0].endswith(path) and 'j=1' not in pg.url, pg.url)
        pg.goto(B + '/journey/#up'); pg.wait_for_selector('#up'); pg.wait_for_timeout(400)
        check(vn + ': Plan My Move’s "Upgrade from HDB" leads into the four-step thread', pg.is_visible('#up') and pg.get_attribute('#up [data-gw-up-go]', 'href').endswith('tools/hdb-upgrade/'), pg.get_attribute('#up [data-gw-up-go]', 'href'))
        # search, by the words people use (the menu's search box)
        pg.goto(B + '/tools/'); pg.wait_for_selector('.gw-tdir')
        for q, want in [('HDB upgrade', 'tools/hdb-upgrade/'), ('TDSR', 'tools/tdsr/'), ('ABSD', 'tools/stamp-duty/'), ('Full payment planning', 'tools/payment-planner/'), ('What can I afford', 'tools/tdsr/#cash'), ('MSR', 'tools/tdsr/#hdb')]:
            hits = pg.evaluate("q => GWN.matchTools(q, 5).map(e => e.href)", q)
            check(vn + ': search "' + q + '" leads to ' + want, bool(hits) and hits[0] == want, hits)
        check(vn + ': the Calculators menu column links Upgrade from HDB, and not the folded pages’ old addresses', pg.locator('.gw-ms-tools a[href$="tools/hdb-upgrade/"]').count() == 1 and pg.locator('.gw-ms-tools a[href$="tools/planner/"], .gw-ms-tools a[href$="tools/msr/"]').count() == 0)
        # ---- 2. the old planner address: fin3-connect-render.py (FE V3)
        # ---- 3. the Timeline's instalment warning
        base = [('cash', '125,000'), ('cpf', '330,000'), ('borrowers.0.fixed', '21,000'), ('borrowers.0.age', '35'), ('ratePct', '3'), ('years', '30')]
        c, t, m = timeline(pg, 'completed', base)
        check(vn + ': payments covered and no monthly amount entered: no shortfall warning', 'ok' in c and 'Every payment is covered' in t and 'short on the monthly instalment' not in t, t[:160])
        check(vn + ': ... the monthly mortgage is named as not tested, with its amount and start, and how to test it', re.search(r'monthly mortgage \(about \$[\d,]+ a month from \d+ \w+ \d{4}\) is not tested here', t) is not None and 'enter what you set aside each month' in t, t[:300])
        check(vn + ': ... the estimated monthly mortgage figure stays visible', re.search(r'\$[\d,]+\s*/month', m) is not None, m[:80])
        c, t, m = timeline(pg, 'completed', base + [('saveMo', '500')])
        check(vn + ': with $500 a month entered and still short, the instalment warning stands', 'warn' in c and 'short on the monthly instalment from' in t, t[:160])
        c, t, m = timeline(pg, 'completed', base + [('saveMo', '8,000')])
        check(vn + ': with $8,000 a month entered everything is covered, said with the amount', 'ok' in c and '$8,000 cash going in each month' in t and 'not tested' not in t, t[:160])
        c, t, m = timeline(pg, 'completed', [('cash', '20,000'), ('cpf', '30,000'), ('borrowers.0.fixed', '21,000'), ('borrowers.0.age', '35'), ('ratePct', '3'), ('years', '30')])
        check(vn + ': a genuine payment shortfall still warns, with the total and the first short payment', 'warn' in c and 'not covered in total' in t and 'Short on' in t, t[:160])
        c, t, m = timeline(pg, 'new', base)
        check(vn + ': a new launch with no monthly amount: payments covered, mortgage not tested (no alarm)', 'ok' in c and 'is not tested here' in t, t[:160])
        check(vn + ': no script errors', not errs, errs[:2]); ctx.close()
finally: srv.terminate()
print(ok, 'passed', fail, 'failed')
sys.exit(1 if fail else 0)
