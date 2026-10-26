import os, pathlib, re, socket, subprocess, sys, tempfile, time
from playwright.sync_api import sync_playwright
"""The one-page A4 summary ("Save as PDF", 26 Oct 2026), per tool, in a browser:
  every figure on the sheet equals the figure on the answer card for the same inputs; one A4 page (printed by Chromium, as Chrome and Edge do);
  the basis line names every chip value; the footer text is exact; the button prints only the sheet, tracks pdf_saved with the tool name only,
  and the sheet is removed afterwards. No fixed waits. Run from the site folder: python3 tools/financial-tests/fin3-sheet-render.py
  PDFs of the example sheets go to $FIN3_SHEETS when set."""
SITE = pathlib.Path(__file__).resolve().parents[2]
OUT = os.environ.get('FIN3_SHEETS')
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
FOOT_LEFT = 'Ken Tan · The Property Guy — Property agent since 2007 · CEA R007903D · Huttons Asia Pte Ltd (L3008899K) · WhatsApp 9090 8898 · tools.kentanthepropertyguy.com'
FOOT_PRIV = 'Figures were entered by you on your device; Groundwork stores nothing.'
RULES = 'Planning estimates from MAS, IRAS, CPF and Housing Developers Rules as checked 9 Oct 2026. Not a bank offer, valuation or financial advice.'
REVEAL = r'''k=>{const f=document.querySelector('[data-k="'+k+'"]');if(!f||(f.checkVisibility?f.checkVisibility():f.offsetParent))return false;const pn=f.closest('[data-chp]');if(pn&&window.__f3OpenChip)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false;const d=f.closest('details');if(d)d.open=true;return !!pn}'''
def typ(pg, k, v):
    opened = pg.evaluate(REVEAL, k); pg.locator(f'[data-k="{k}"]').first.fill(v)
    if opened: pg.evaluate("()=>window.__f3OpenChip(null)")
def until(pg, js, t=8000):
    try: pg.wait_for_function(js, timeout=t); return True
    except Exception: return False
digits = lambda t: re.sub(r'[^0-9.]', '', t or '')
STOP = {'a', 'own', 'loan', 'home', 'of', 'the', 'other'}
def chip_words(pg):
    labels = pg.evaluate("[...document.querySelectorAll('[data-chip-l]')].map(e=>e.textContent)")
    return labels, [w for l in labels for w in re.split(r'[\s,·&]+', l.lower()) if w and w not in STOP]
def sheet(pg):
    pg.evaluate("GW_SHEET.mount(window.__f3Sheet())")
    return pg.evaluate("""()=>{const s=document.querySelector('.gs-sheet');const f={};s.querySelectorAll('[data-sheet-fig]').forEach(e=>f[e.dataset.sheetFig]=e.textContent);
      return {figs:f, basis:s.querySelector('[data-sheet-basis]').textContent, judge:(s.querySelector('[data-sheet-judge]')||{}).textContent||'', left:s.querySelector('[data-sheet-foot-left]').textContent,
      right:s.querySelector('[data-sheet-foot-right]').textContent, ref:s.querySelector('[data-sheet-ref]').textContent, cls:s.className, text:s.textContent}}""")
def one_page(pg, path):
    pg.emulate_media(media='print')
    only = pg.evaluate("()=>[...document.body.children].every(e=>e.classList.contains('gw-sheet-host')||getComputedStyle(e).display==='none')")
    pdf = pg.pdf(path=path, prefer_css_page_size=True, print_background=True); pg.emulate_media(media='screen')
    n = len(re.findall(rb'/Type\s*/Page[^s]', pdf)); box = re.search(rb'/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)', pdf)
    return n, (float(box.group(1)), float(box.group(2))) if box else None, only
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1280, 'height': 900}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=''))
        tmp = OUT or tempfile.mkdtemp(prefix='gw-sheet-'); os.makedirs(tmp, exist_ok=True)
        # ---------------- cost: $2,000,000 new launch, Singapore Citizen, first home ----------------
        pg.goto(B + '/tools/payment-planner/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]')
        check('cost: no Save as PDF before there is an answer', pg.is_hidden('[data-save-pdf]'))
        typ(pg, 'price', '2,000,000'); until(pg, "()=>window.__f3Settled()&&!!window.__f3Sheet()")
        check('cost: “Save as PDF” is a text button, the last row of the answer card', pg.evaluate("()=>{const b=document.querySelector('[data-save-pdf]');return !!b&&!b.hidden&&b.textContent==='Save as PDF'&&b===b.parentElement.lastElementChild&&!!b.closest('.f3-card')}"))
        card = pg.evaluate("""()=>{const o=document.querySelector('[data-out]');const rows={};o.querySelectorAll('.f3-ar').forEach(r=>rows[r.querySelector('.f3-an').textContent]=r.querySelector('.f3-af').textContent);
          const rc={};document.querySelectorAll('[data-bd-out] .f3-rl').forEach(r=>rc[r.querySelector('span').textContent]=r.querySelector('b').textContent);return {rows:rows, rc:rc, judge:(o.querySelector('.f3-fact')||{}).textContent||''}}""")
        labels, words = chip_words(pg)
        sh = sheet(pg)
        # V3.7: a new launch leads with what is needed upfront (booking, S&P, stamp duty); the sheet leads with the same figure
        check('cost: Needed upfront on the sheet equals the card ($469,600), and the sheet says $569,600 from you in all', digits(sh['figs']['upfront']) == digits(card['rows']['Needed upfront']) == '469600' and 'S$569,600 from you in all' in sh['text'], [sh['figs'].get('upfront'), card['rows'].get('Needed upfront')])
        check('cost: the monthly instalment equals the card ($7,161)', digits(sh['figs']['monthly']) == digits(card['rows']['Monthly instalment']) == '7161')
        check('cost: the income needed equals the card (≈ $13,000)', digits(sh['figs']['income']) == digits(card['rows']['Income needed']) == '13000', [sh['figs'].get('income'), card['rows'].get('Income needed')])
        check('cost: the upfront total equals the card’s breakdown ($569,600) and so does the bank loan ($1,500,000)', digits(sh['figs']['fromyou']) == digits(card['rc']['From you, cash and CPF']) == '569600' and digits(sh['figs']['loan']) == digits(card['rc']['Bank loan']) == '1500000')
        check('cost: the upfront line names booking, the S&P and the S$69,600 stamp duty, then S$100,000 during construction; the MAS minimum cash and the stamp duty wording are kept', 'Booking fee, the S&P payment and S$69,600 stamp duty' in sh['text'] and 'Then S$100,000 during construction' in sh['text'] and 'S$100,000' in sh['text'] and 'MAS rule' in sh['text'] and 'usually paid in cash first' not in sh['text'] and 'CPF may reimburse eligible duty' in sh['text'], sh['text'][:900])
        check('cost: the judgement sentence is the card’s, in S$', sh['judge'] == card['judge'].replace('$', 'S$') and sh['judge'] != '', [sh['judge'], card['judge']])
        check('cost: the basis line names every chip value ' + str(labels), all(w in sh['basis'].lower() for w in words), [w for w in words if w not in sh['basis'].lower()])
        check('cost: the footer text is exact', sh['left'] == FOOT_LEFT and sh['right'] == RULES + ' ' + FOOT_PRIV, [sh['left'], sh['right']])
        check('cost: the reference is the tool and four characters (no figures)', re.fullmatch(r'GW-COST-[2-9A-HJ-NP-Z]{4}', sh['ref']) is not None, sh['ref'])
        check('cost: the sheet has the card’s stages (V3.7): booking, the S&P and stamp duty with the upfront subtotal, the construction share, the total and the bank, with timings from the option', all(x in sh['text'] for x in ['Booking fee 5%', 'On the option', 'At the S&P 15%', 'Within 8 weeks', 'Buyer’s stamp duty', '14 days after S&P', 'Upfront, in all', 'S$469,600', 'Foundation stage, your share', 'From 12 weeks', 'From you, in all', 'The bank pays', 'Then each month']) and 'Ken Tan' in sh['text'], sh['text'][-1200:])
        check('cost: the sheet carries Ken’s photograph (the site’s own file) in the footer', pg.evaluate("()=>{const i=document.querySelector('.gs-ft [data-sheet-photo]');return !!i&&/assets\\/img\\/ken-circle-600\\.jpg$/.test(i.getAttribute('src'))}"))
        n, size, only = one_page(pg, os.path.join(tmp, 'Groundwork-summary-cost.pdf'))
        check('cost: one A4 page, and only the sheet prints', n == 1 and size and abs(size[0] - 595) < 2 and abs(size[1] - 842) < 2 and only, [n, size, only])
        pg.evaluate("GW_SHEET.unmount()")
        # an option date, a second home and the full dated schedule still fit one page
        pg.evaluate("window.__f3AllPay(true)"); typ(pg, 'otp', '2026-11-02')
        pg.evaluate("()=>{document.querySelector('[data-k=\"homes\"] button[data-v=\"1\"]').click()}"); until(pg, "()=>window.__f3Settled()&&/ABSD/.test(document.querySelector('[data-duty-line]').textContent)")
        sh2 = sheet(pg)
        check('cost (dated, second home): dates on the schedule, ABSD in the cash line', '2 Nov 2026' in sh2['text'] and '28 Dec 2026' in sh2['text'] and 'ABSD 20%' in sh2['text'] and 'option 2 Nov 2026' in sh2['basis'] and 'owns a home' in sh2['basis'], sh2['basis'])
        n, size, only = one_page(pg, os.path.join(tmp, '.cost-dated.pdf'))
        check('cost (dated, second home): still one A4 page', n == 1 and only, [n, sh2['cls']])
        pg.evaluate("GW_SHEET.unmount()")
        # the button: prints only the sheet, tracks pdf_saved with the tool name only, removes the sheet afterwards
        pg.evaluate("""()=>{window.__printed=0;window.print=()=>{window.__printed++;window.__during=!!document.querySelector('.gw-sheet-host')};window.__ev=[];
          if(window.KPT&&window.KPT.track){const t=window.KPT.track;window.KPT.track=function(n,p){window.__ev.push([n,JSON.stringify(p||{})]);return t.apply(this,arguments)}}}""")
        pg.click('[data-save-pdf]')
        ev = pg.evaluate("window.__ev.filter(e=>e[0]==='pdf_saved')")
        check('cost: the button builds the sheet and prints once (after the photograph has loaded)', until(pg, "()=>window.__printed===1&&window.__during===true"))
        check('cost: pdf_saved is tracked with the tool name only; no figure in the event or the address', len(ev) == 1 and set(eval(ev[0][1].replace('true', 'True').replace('false', 'False').replace('null', 'None')).keys()) <= {'tool_name'} and not re.search(r'\d{3}', ev[0][1]) and not re.search(r'\d{4}', pg.url.split('/', 3)[-1]), [ev, pg.url])
        pg.evaluate("window.dispatchEvent(new Event('afterprint'))")
        check('cost: the sheet is removed after printing', until(pg, "()=>!document.querySelector('.gw-sheet-host')"))
        # printing from the browser menu prints the same sheet, never the screen
        pg.evaluate("window.dispatchEvent(new Event('beforeprint'))")
        check('cost: the browser’s own Print also gets the sheet', pg.evaluate("!!document.querySelector('.gw-sheet-host .gs-sheet')"))
        pg.evaluate("window.dispatchEvent(new Event('afterprint'))")
        # ---------------- borrow: $8,000 a month, age 35, private home ----------------
        pg.goto(B + '/tools/tdsr/'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]')
        typ(pg, 'p.0.fixed', '8,000'); typ(pg, 'p.0.age', '35'); until(pg, "()=>window.__f3Settled()&&!!window.__f3Sheet()")
        check('borrow: “Save as PDF” is the last row of the answer card', pg.evaluate("()=>{const b=document.querySelector('[data-save-pdf]');return !!b&&!b.hidden&&b===b.parentElement.lastElementChild}"))
        card = pg.evaluate("""()=>{const o=document.querySelector('[data-out]');const rows={};o.querySelectorAll('.f3-ar').forEach(r=>rows[r.querySelector('.f3-an').textContent]=r.querySelector('.f3-af').textContent);return {rows:rows, judge:(o.querySelector('.f3-fact')||{}).textContent||''}}""")
        labels, words = chip_words(pg)
        sh = sheet(pg)
        check('borrow: the bank may lend about $921,000 on both', digits(sh['figs']['lend']) == digits(card['rows']['The bank may lend about']) == '921000' and digits(sh['figs']['lend2']) == '921000')
        check('borrow: the monthly instalment ($4,400) and the home price (≈ $1.22M) equal the card', digits(sh['figs']['monthly']) == digits(card['rows']['Monthly instalment']) == '4400' and digits(sh['figs']['price']) == digits(card['rows']['Home price this loan supports']) == '1.22')
        check('borrow: the judgement sentence is the card’s, in S$', sh['judge'] == card['judge'].replace('$', 'S$') and 'Income is the limit here' in sh['judge'])
        check('borrow: the basis line names every chip value ' + str(labels), all(w in sh['basis'].lower() for w in words), [w for w in words if w not in sh['basis'].lower()])
        check('borrow: how the loan is worked out: income, the 55% limit, the stress rate and the tenure', all(x in sh['text'] for x in ['Income, before CPF', 'The limit: 55% of income', 'Stress rate', 'Tenure', 'ending at age 65']))
        check('borrow: the home price this loan supports, with the upfront it needs', 'Home price this loan supports' in sh['text'] and 'Upfront, cash and CPF' in sh['text'])
        check('borrow: the footer text is exact', sh['left'] == FOOT_LEFT and sh['right'] == RULES + ' ' + FOOT_PRIV)
        check('borrow: the reference names the tool', re.fullmatch(r'GW-BORROW-[2-9A-HJ-NP-Z]{4}', sh['ref']) is not None, sh['ref'])
        n, size, only = one_page(pg, os.path.join(tmp, 'Groundwork-summary-borrow.pdf'))
        check('borrow: one A4 page, and only the sheet prints', n == 1 and size and abs(size[1] - 842) < 2 and only, [n, size])
        pg.evaluate("GW_SHEET.unmount()")
        # age as the limit: the longer tenure, its 55% limit and 10% cash
        typ(pg, 'p.0.fixed', '20,000'); typ(pg, 'p.0.bonusYr', '50,000'); typ(pg, 'p.0.age', '48'); until(pg, "()=>window.__f3Settled()&&/Age is the limit/.test(document.querySelector('[data-out]').textContent)")
        sh = sheet(pg)
        check('borrow, age 48: the longer-tenure alternative with 55% and 10% (on a $4.5M home, $2,025,000 upfront, at least $450,000 cash)', all(x in sh['text'] for x in ['If the loan ran to age 75', 'S$2,494,000', '55%', '10%', 'On a S$4.5M home', 'S$2,025,000', 'S$450,000']), sh['text'][-600:])
        n, size, only = one_page(pg, os.path.join(tmp, '.borrow-age48.pdf'))
        check('borrow, age 48: still one A4 page', n == 1)
        check('no script errors', not errs, errs)
        br.close()
finally:
    srv.terminate()
print('fin3-sheet-render: %d passed, %d failed' % (ok, fail))
sys.exit(1 if fail else 0)
