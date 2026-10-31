"""Priority 1 (31 Oct 2026): What will this home cost me? recalculates fully on every change, in any order, desktop 1440 and phone 390.
Run from the site folder:  python3 tools/financial-tests/recalc-render.py
Each scenario is entered the way a buyer would (typing the price, the chips and their sheets, the home cards), then checked:
  * after every step: recalculating from the very same entries changes nothing on screen (nothing stale, nothing waiting for another click)
  * at the end: the screen equals the same entries drawn afresh (a reload of this tab), whatever order they were entered in
  * the payment schedule is complete: for a new launch every construction stage is listed, and the card's stages add up to the card's own
    down payment, stamp duty and loan; a completed home lists the option, exercise and completion, never construction stages
  * no script error, no NaN or undefined, no sideways scroll
Scenarios: first home (price and loan changed); second home with a loan, price before and after the homes; second home fully paid;
two buyers, before and after the price; two buyers with a loan; residency changed and changed back; new launch; completed home;
property type switched and back; first, second and first again; the home-loan question unanswered (the schedule stays, the figures wait);
an HDB valuation left behind when another property type is chosen (not counted, and counted again for the HDB flat); rapid changes."""
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
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
SNAP = """()=>{const t=(s)=>{const e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():''};const h=(s)=>{const e=document.querySelector(s);return e?e.hidden:null};
 return {out:t('[data-out]'),sched:t('[data-sched]'),schsec:h('[data-schsec]'),bd:t('[data-bd-out]'),fund:t('[data-fund-out]'),chips:t('.f3-chips')}}"""
FACTS = """()=>{const o=document.querySelector('[data-out]');const g=window.__f3Stages&&window.__f3Stages();const pl=window.__f3Plan&&window.__f3Plan();
 return {res:!!o.querySelector('[data-answer]'),stages:!!o.querySelector('[data-stages]'),next:/Next payments/.test(o.textContent),ok:g?g.ok:null,
  rows:[...document.querySelectorAll('[data-sched] tbody tr')].map(r=>r.textContent.replace(/\\s+/g,' ').trim()),schsec:(document.querySelector('[data-schsec]')||{}).hidden,
  groups:pl?pl.groups.map(x=>x.key):[],dash:(o.textContent.match(/—/g)||[]).length,text:o.textContent.replace(/\\s+/g,' ')}}"""
BUILD = ['Foundation', 'framework', 'Partition walls', 'Roofing', 'Door and window', 'roads and drains', 'Temporary Occupation Permit', 'Statutory Completion']   # a new launch's stages (GW_SCHEDULE)
def settle(pg): pg.wait_for_function("()=>window.__f3Settled&&window.__f3Settled()", timeout=10000); pg.wait_for_timeout(60)
def act(pg, a):
    k = a[0]
    if k == 'price':
        f = pg.locator('[data-k="price"]:visible').first; f.click(); pg.keyboard.press('Control+A'); pg.keyboard.type(a[1], delay=10)
    elif k == 'opt':
        chip, want = a[1], a[2]
        if pg.get_attribute(f'[data-chip="{chip}"]', 'aria-expanded') != 'true': pg.click(f'[data-chip="{chip}"]')
        pg.wait_for_selector(f'[data-optl="{chip}"] [data-opt]')
        r = pg.evaluate("""([chip,want])=>{const bs=[...document.querySelectorAll('[data-optl="'+chip+'"] [data-opt]')];const b=bs.find(x=>{const o=JSON.parse(x.dataset.opt);return Object.keys(want).every(k=>String(o.set[k])===String(want[k]))});if(!b)return 'none';b.click();return 'ok'}""", [chip, want])
        if r != 'ok': raise Exception('no option ' + json.dumps(want))
    elif k == 'close': pg.evaluate("()=>window.__f3OpenChip(null)")
    elif k == 'home': pg.locator(f'[data-home="{a[1]}"] button[data-hk="{a[2]}"][data-v="{a[3]}"]').first.click()
    elif k == 'homeamt':
        f = pg.locator(f'[data-home="{a[1]}"] [data-hk="amt"]').first; f.click(); pg.keyboard.press('Control+A'); pg.keyboard.type(a[2], delay=10)
    elif k == 'fill':
        pg.evaluate("k=>{const f=[...document.querySelectorAll('[data-k=\"'+k+'\"]')].find(x=>x.offsetParent)||document.querySelector('[data-k=\"'+k+'\"]');const pn=f.closest('[data-chp]');if(pn&&pn.hidden)window.__f3OpenChip(pn.dataset.chp,k);const cu=f.closest('[data-cust]');if(cu)cu.hidden=false}", a[1])
        f = pg.locator(f'[data-k="{a[1]}"]:visible').first; f.click(); pg.keyboard.press('Control+A'); pg.keyboard.type(a[2], delay=10)
    elif k == 'select':
        f = pg.locator(f'[data-k="{a[1]}"]:visible').first; f.select_option(a[2])
def fresh(ctx):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-out]'); pg.evaluate("sessionStorage.clear()"); pg.reload(); pg.wait_for_selector('[data-out]'); settle(pg)
    return pg, errs
def stale(pg):   # recalculate from the same entries (a change event on the price, nothing edited): the screen must not move
    a = pg.evaluate(SNAP); pg.evaluate("()=>document.querySelector('[data-k=\"price\"]').dispatchEvent(new Event('change',{bubbles:true}))"); settle(pg); b = pg.evaluate(SNAP)
    return [k for k in a if a[k] != b[k]]
def run(ctx, seq, rapid=False):
    pg, errs = fresh(ctx); st = []
    for a in seq:
        act(pg, a)
        if not rapid:
            settle(pg); d = stale(pg)
            if d: st.append((a, d))
    pg.evaluate("document.activeElement&&document.activeElement.blur()"); pg.evaluate("()=>window.__f3OpenChip(null)"); settle(pg); pg.wait_for_timeout(150); settle(pg)
    return pg, errs, st
def end(pg):   # the screen now, and the same entries drawn afresh
    a = pg.evaluate(SNAP); f = pg.evaluate(FACTS); pg.reload(); pg.wait_for_selector('[data-out]'); settle(pg); b = pg.evaluate(SNAP)
    return a, b, f
def common(tag, name, pg, errs, st, a, b, f, w):
    check(f'{tag} {name}: every step recalculated in full (nothing changes when recalculated from the same entries)', not st, st[:2])
    check(f'{tag} {name}: the screen equals the same entries drawn afresh', a == b, [k for k in a if a[k] != b[k]])
    check(f'{tag} {name}: no script error, NaN or undefined; no sideways scroll', not errs and not re.search(r'NaN|undefined', a['out'] + a['sched']) and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), errs[:2])
def complete(tag, name, f, kind):
    if kind == 'new':
        check(f'{tag} {name}: the card lists its stages and they add up to the card (down payment, stamp duty, loan)', f['res'] and f['stages'] and f['ok'] is True and not f['next'] and 'build' in f['groups'], [f['ok'], f['groups'], f['next']])
        check(f'{tag} {name}: All payments lists every construction stage', f['schsec'] is False and all(any(s in r for r in f['rows']) for s in BUILD), f['rows'][:12])
    else:
        check(f'{tag} {name}: a completed home: option, exercise, completion; no construction stage', f['res'] and f['stages'] and f['ok'] is True and f['schsec'] is False and any('Completion' in r or 'completion' in r for r in f['rows']) and not any(s in ' '.join(f['rows']) for s in BUILD[:6]), f['rows'])
def scen(tag, ctx, name, seq, kind='new', rapid=False, extra=None):
    pg, errs, st = run(ctx, seq, rapid); a, b, f = end(pg)
    common(tag, name, pg, errs, st, a, b, f, 0); complete(tag, name, f, kind)
    if extra: extra(f, a)
    pg.close(); return a
H1 = [['opt', 'who', {'__homes': 1}]]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); ctx.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        print('--', tag)
        # 1 first home, single buyer: initial, price change, loan change
        first = scen(tag, ctx, 'first home', [['price', '1,500,000']], extra=lambda f, a: check(f'{tag} first home: no ABSD, stamp duty included', 'ABSD' not in f['text'] and 'stamp duty' in f['text']))
        p2 = scen(tag, ctx, 'first home, price changed', [['price', '1,500,000'], ['price', '1,800,000']])
        check(f'{tag} first home: a new price gives new figures', p2['out'] != first['out'] and '$1,800,000' in p2['out'])
        scen(tag, ctx, 'first home, loan changed', [['price', '1,800,000'], ['opt', 'loan', {'loanAmt': '1,080,000'}]], extra=lambda f, a: check(f'{tag} first home: the 60% loan is used', '$1,080,000' in f['text'], f['text'][:300]))
        # 2 second home with a loan still being paid: price before and after the homes
        sec_a = scen(tag, ctx, 'second home with a loan (price first)', [['price', '1,800,000']] + H1 + [['home', 0, 'mort', 'yes'], ['homeamt', 0, '2,500'], ['close']],
                     extra=lambda f, a: check(f'{tag} second home with a loan: ABSD 20% and the 45% loan limit', 'ABSD 20%' in f['text'] and '45%' in a['bd'] + a['out'], f['text'][:300]))
        sec_b = scen(tag, ctx, 'second home with a loan (homes first)', H1 + [['home', 0, 'mort', 'yes'], ['homeamt', 0, '2,500'], ['close'], ['price', '1,800,000']])
        check(f'{tag} second home with a loan: the same figures and schedule whichever is entered first', sec_a == sec_b, [k for k in sec_a if sec_a[k] != sec_b[k]])
        # 3 second home, no outstanding loan
        scen(tag, ctx, 'second home, loan fully paid', [['price', '1,800,000']] + H1 + [['home', 0, 'mort', 'no'], ['close']],
             extra=lambda f, a: check(f'{tag} second home, no loan: ABSD 20% and the 75% loan', 'ABSD 20%' in f['text'] and '$1,350,000' in f['text'], f['text'][:300]))
        # 4 two buyers, first home, before and after the price
        j_a = scen(tag, ctx, 'two buyers (before the price)', [['opt', 'who', {'n': '2'}], ['select', 'p.1.res', 'PR'], ['fill', 'p.1.age', '33'], ['close'], ['price', '2,100,000']])
        j_b = scen(tag, ctx, 'two buyers (after the price)', [['price', '2,100,000'], ['opt', 'who', {'n': '2'}], ['select', 'p.1.res', 'PR'], ['fill', 'p.1.age', '33'], ['close']])
        check(f'{tag} two buyers: the same result whichever is entered first', j_a == j_b, [k for k in j_a if j_a[k] != j_b[k]])
        # 5 two buyers, a home owned together with a loan
        scen(tag, ctx, 'two buyers with a loan', [['price', '2,400,000'], ['opt', 'who', {'n': '2'}], ['close']] + H1 + [['home', 0, 'mort', 'yes'], ['homeamt', 0, '3,000'], ['close']],
             extra=lambda f, a: check(f'{tag} two buyers with a loan: the 45% loan limit', '45%' in a['bd'] + a['out'], a['bd'][:200]))
        # 6 residency changed, and changed back: the original result returns
        r = scen(tag, ctx, 'residency changed and back', [['price', '1,500,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}], ['opt', 'who', {'n': '1', 'p.0.res': 'FR'}], ['opt', 'who', {'n': '1', 'p.0.res': 'SC'}]])
        check(f'{tag} residency changed and back: the original result returns', r == first, [k for k in r if r[k] != first[k]])
        # 7 completed home; 8 type switched and back
        scen(tag, ctx, 'completed home', [['opt', 'pkind', {'pkind': 'completed'}], ['price', '2,000,000'], ['opt', 'cpf', {'cpf': '200,000'}], ['price', '2,200,000']], kind='completed')
        sw = scen(tag, ctx, 'type switched and back', [['price', '1,500,000'], ['opt', 'pkind', {'pkind': 'completed'}], ['opt', 'pkind', {'pkind': 'ec'}], ['opt', 'pkind', {'pkind': 'resaleec'}], ['opt', 'pkind', {'pkind': 'new'}]])
        check(f'{tag} type switched and back: the original result, with no stage left over', sw == first, [k for k in sw if sw[k] != first[k]])
        scen(tag, ctx, 'switched to a completed home', [['price', '1,500,000'], ['opt', 'pkind', {'pkind': 'completed'}]], kind='completed')
        # 9 first, second, then first home again
        rv = scen(tag, ctx, 'first, second, first again', [['price', '1,500,000']] + H1 + [['home', 0, 'mort', 'no'], ['close'], ['opt', 'who', {'__homes': 0}], ['close']])
        check(f'{tag} first, second, first again: the original result returns', rv == first, [k for k in rv if rv[k] != first[k]])
        # 10 the home-loan question not answered yet: the figures wait and say why; the schedule (price and dates only) stays
        pg, errs, st = run(ctx, [['price', '1,800,000']] + H1 + [['close']]); f = pg.evaluate(FACTS)
        check(f'{tag} home-loan question unanswered: cash, CPF and instalment wait, and the card says for what', f['dash'] >= 3 and 'Waiting for one answer' in f['text'] and 'Answer it' in f['text'], f['text'][:200])
        check(f'{tag} home-loan question unanswered: the payment schedule stays (every construction stage), with the next payments on the card', f['schsec'] is False and all(any(s in r for r in f['rows']) for s in BUILD) and f['next'], [f['schsec'], len(f['rows']), f['next']])
        check(f'{tag} home-loan question unanswered: no cash or loan figure is assumed', 'Cash you’ll need —' in f['text'] or re.search(r'Cash you’ll need.{0,120}—', f['text']), f['text'][:200])
        pg.locator('[data-out] [data-open-who]').first.click(); pg.wait_for_selector('[data-home="0"] button[data-hk="mort"]'); act(pg, ['home', 0, 'mort', 'yes']); act(pg, ['homeamt', 0, '2,500']); act(pg, ['close']); settle(pg)
        f2 = pg.evaluate(FACTS)
        check(f'{tag} home-loan question answered: every figure and the card\'s stages appear at once, no other click', f2['res'] and f2['stages'] and f2['ok'] is True and f2['dash'] == 0 and not stale(pg), [f2['ok'], f2['dash']])
        check(f'{tag} answered: the same as entering it in one go', pg.evaluate(SNAP) == sec_a, [k for k in sec_a if pg.evaluate(SNAP)[k] != sec_a[k]])
        pg.close()
        # 11 an HDB valuation left behind when another property type is chosen
        hdb = [['opt', 'pkind', {'pkind': 'hdb'}], ['price', '1,300,000'], ['fill', 'valuation', '1,400,000'], ['close']]
        pg, errs, st = run(ctx, hdb); h0 = pg.evaluate(SNAP); pg.close()
        rec = scen(tag, ctx, 'Resale EC after an HDB valuation', hdb + [['opt', 'pkind', {'pkind': 'resaleec'}]], kind='completed')
        ref = scen(tag, ctx, 'Resale EC entered directly', [['opt', 'pkind', {'pkind': 'resaleec'}], ['price', '1,300,000']], kind='completed')
        check(f'{tag} the HDB valuation is not counted for a Resale EC (the page no longer asks for it): same as entering the Resale EC directly', rec == ref, [k for k in rec if rec[k] != ref[k]])
        cp = scen(tag, ctx, 'completed home after an HDB valuation', [['opt', 'pkind', {'pkind': 'hdb'}], ['price', '2,200,000'], ['fill', 'valuation', '1,000,000'], ['close'], ['opt', 'pkind', {'pkind': 'completed'}]], kind='completed')
        cr = scen(tag, ctx, 'completed home entered directly', [['opt', 'pkind', {'pkind': 'completed'}], ['price', '2,200,000']], kind='completed')
        check(f'{tag} the HDB valuation is not counted for a completed private home', cp == cr, [k for k in cp if cp[k] != cr[k]])
        pg, errs, st = run(ctx, hdb + [['opt', 'pkind', {'pkind': 'resaleec'}], ['opt', 'pkind', {'pkind': 'hdb'}]]); h1 = pg.evaluate(SNAP)
        check(f'{tag} back to the HDB flat: its valuation is counted again, the original result', h1 == h0 and not st, [k for k in h0 if h0[k] != h1[k]]); pg.close()
        # 12 rapid changes, no pause between them
        rp = scen(tag, ctx, 'rapid changes', [['price', '1,200,000'], ['opt', 'pkind', {'pkind': 'completed'}], ['price', '2,000,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}], ['opt', 'pkind', {'pkind': 'new'}], ['opt', 'who', {'n': '1', 'p.0.res': 'SC'}], ['price', '1,500,000']], rapid=True)
        check(f'{tag} rapid changes: the final result is the plain first-home result', rp == first, [k for k in rp if rp[k] != first[k]])
        ctx.close()
    br.close()
finally:
    srv.terminate()
print('recalc-render: %d passed, %d failed' % (ok, fail))
raise SystemExit(1 if fail else 0)
