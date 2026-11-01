"""Priority 1 answer-first (1 Nov 2026): What will this home cost me? shows every figure the entries already decide, even while a home-loan question waits.
Run from the site folder:  python3 tools/financial-tests/answer-first-render.py      (desktop 1440 and phone 390)
Known now, whatever the loan: the payments due upfront (booking or option, the S&P or exercise, BSD, ABSD, each with its own deadline), the stamp duty and every
stage of the gross schedule. Loan-dependent (limit, bank loan, cash, CPF, instalment): shown for each answer, from the same engine, labelled as illustrations;
confirmed only once answered, and then equal to the matching illustration. Never a confirmed figure on an unanswered loan; never a construction date invented.
 1  $2.65M new launch, one PR buyer, second home, CPF 0, loan unanswered: 132,500 + 397,500 + 102,100 + 795,000 = 1,427,100; 75% / 45% side by side
 2  the same, answered Yes (no repayment yet, then with it), No, then unanswered again (the first screen returns)
 3  SC first home   4  PR first home   5  second home with a loan   6  SC and PR buyers   7  two borrowers, separate and joint home loans
 8  new launch against a completed home   9  CPF 0 against CPF not entered   10  rapid changes and the order reversed"""
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

def known(tag, name, f, kind='new'):
    t = f['text']
    check(f'{tag} {name}: the known figures show: upfront payments and stamp duty, never a dash', f['known'] is not None and '—' not in f['knownRow'] and 'Stamp duty' in t, [f['known'], f['knownRow']])
    if kind == 'new':
        check(f'{tag} {name}: every construction stage of the gross schedule, with no invented date', all(s in f['gross'] for s in GROSS_NEW) and 'As the developer calls it' in f['gross'] and not re.search(r'\b(19|20)\d\d\b', f['grossLater']), f['gross'][:400])
    else:
        check(f'{tag} {name}: a completed home: option, exercise, duty, then the balance at completion; no construction stage', all(s in f['gross'] for s in ['Option fee', 'Exercising the option', 'Balance at completion']) and 'Foundation' not in f['gross'], f['gross'][:300])
    check(f'{tag} {name}: no confirmed loan figure while the loan waits; the illustrations say so and "Answer it" stays', not f['confirmed'] and 'illustrations, not loan offers' in t and f['answerIt'], [f['confirmed'], f['answerIt']])
    check(f'{tag} {name}: All payments holds the full schedule', f['schsec'] is False and f['schedRows'] >= (12 if kind == 'new' else 5), f['schedRows'])
GROSS_NEW = ['Booking fee', 'At the S&P', 'Buyer’s stamp duty', 'Foundation stage', 'Framework stage', 'Walls stage', 'Roofing stage', 'Fittings stage', 'Roads and drains stage', 'At TOP', 'At CSC']
AF = """()=>{const o=document.querySelector('[data-out]');const t=o.textContent.replace(/\\s+/g,' ');const k=o.querySelector('[data-known-up]');const kr=k?k.closest('.f3-ar').textContent.replace(/\\s+/g,' '):'';
 const g=o.querySelector('[data-stages-gross]');const il=o.querySelector('[data-illus]');const cols=il?[...il.querySelectorAll('thead th[scope=col]')].map(x=>x.textContent.trim()):[];
 const cell=(r)=>il?[...il.querySelectorAll('tbody tr')].filter(x=>x.querySelector('th').textContent.indexOf(r)===0).map(x=>[...x.querySelectorAll('td')].map(td=>td.textContent.replace(/\\s+/g,' ').trim()))[0]||[]:[];
 const up=g?[...g.querySelectorAll('[data-sg=up] .f3-sr')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()):[];
 return {text:t,known:k?k.textContent:null,knownRow:kr,gross:g?g.textContent.replace(/\\s+/g,' '):'',grossLater:g&&g.querySelector('[data-sg=later]')?g.querySelector('[data-sg=later]').textContent:'',up:up,cols:cols,
  limit:cell('Loan limit'),loan:cell('Bank loan'),cash:cell('Cash you’ll need'),cpf:cell('CPF used'),inst:cell('Monthly instalment'),confirmed:!!o.querySelector('[data-answer]'),answerIt:!!o.querySelector('[data-open-who]'),
  schsec:(document.querySelector('[data-schsec]')||{}).hidden,schedRows:document.querySelectorAll('[data-sched] tbody tr').length,
  cardCash:(()=>{const r=[...o.querySelectorAll('.f3-ar')].find(x=>/^Cash you’ll need/.test(x.querySelector('.f3-an').textContent.trim()));return r?r.querySelector('.f3-af').textContent.trim():''})(),
  stagesOk:window.__f3Stages&&window.__f3Stages()?window.__f3Stages().ok:null}}"""
NS = lambda x: re.sub(r'\s+', '', x)   # the page's own text with the layout's spacing removed (labels, amounts and dates run together in textContent)
def af(pg): settle(pg); return pg.evaluate(AF)
def clean(tag, name, pg, errs):
    check(f'{tag} {name}: no script error, NaN or undefined; no sideways scroll', not errs and not re.search(r'NaN|undefined', pg.inner_text('[data-out]')) and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), errs[:2])
EX = [['price', '2,650,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}], ['opt', 'who', {'__homes': 1}], ['close'], ['fill', 'cpf', '0'], ['close']]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); ctx.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        print('--', tag)
        # 1 the $2.65M example
        pg, errs, st = run(ctx, EX); f = af(pg); ex_snap = pg.evaluate(SNAP)
        n = '$2.65M PR second home, loan unanswered'
        check(f'{tag} {n}: every step recalculated in full', not st, st[:2])
        check(f'{tag} {n}: known upfront $1,427,100', f['known'] == '$1,427,100', f['known'])
        check(f'{tag} {n}: booking 5% $132,500 on the option; S&P 15% $397,500 within 8 weeks; BSD $102,100 and ABSD 30% $795,000 within 14 days of the S&P',
              [NS(x) for x in f['up'][:4]] == [NS(x) for x in ['Booking fee 5% $132,500 On the option', 'At the S&P 15% $397,500 Within 8 weeks of the option', 'Buyer’s stamp duty $102,100 Within 14 days of signing the S&P', 'ABSD 30% $795,000 Within 14 days of signing the S&P']], f['up'])
        check(f'{tag} {n}: stamp duty $897,100 ($102,100 BSD + $795,000 ABSD 30%)', '$897,100' in f['text'] and '$102,100 BSD + $795,000 ABSD 30%' in f['text'])
        check(f'{tag} {n}: the full gross stages: 10% $265,000 ... TOP 25% $662,500, CSC 15% $397,500', all(NS(x) in NS(f['gross']) for x in ['Foundation stage 10% $265,000', 'At TOP 25% $662,500', 'At CSC 15% $397,500']), f['gross'][-400:])
        known(tag, n, f)
        check(f'{tag} {n}: side by side, "If fully paid" 75% / "If still being paid" 45%, from the engine', f['cols'] == ['If fully paid', 'If still being paid'] and f['limit'][0].startswith('75%') and f['limit'][1].startswith('45%') and f['loan'] == ['$1,987,500', '$1,192,500'] and f['cash'] == ['$1,559,600', '$2,354,600'] and f['cpf'] == ['$0', '$0'], [f['cols'], f['limit'], f['loan'], f['cash']])
        check(f'{tag} {n}: no age, income or loan amount added: the instalments say their rate and tenure', all(re.search(r'\d+(\.\d+)?%, \d+ years', x) for x in f['inst']), f['inst'])
        clean(tag, n, pg, errs)
        pg.locator('[data-out] [data-open-who]').first.click(); pg.wait_for_selector('[data-home="0"] button[data-hk="mort"]', state='visible')
        check(f'{tag} {n}: "Answer it" opens the question', pg.locator('[data-home="0"] button[data-hk="mort"][data-v="yes"]:visible').count() == 1)
        # 2 Yes (no repayment yet), then the repayment, then No, then unanswered again
        act(pg, ['home', 0, 'mort', 'yes']); f = af(pg)
        check(f'{tag} answered Yes, repayment not typed: still not confirmed; one column, 45%, and the repayment is asked for', not f['confirmed'] and f['cols'] == ['With the loan still being paid'] and f['limit'][0].startswith('45%') and 'monthly repayment' in f['text'] and f['known'] == '$1,427,100', [f['cols'], f['limit'], f['confirmed']])
        act(pg, ['homeamt', 0, '2,500']); act(pg, ['close']); f = af(pg)
        check(f'{tag} answered Yes with the repayment: confirmed, equal to the "still being paid" illustration (cash $2,354,600)', f['confirmed'] and f['cardCash'] == '$2,354,600' and '$1,192,500' in f['text'] and not f['cols'] and f['stagesOk'] is True and not stale(pg), [f['cardCash'], f['confirmed']])
        pg.locator('[data-chip="who"]').click(); pg.wait_for_selector('[data-home="0"] button[data-hk="mort"]', state='visible'); act(pg, ['home', 0, 'mort', 'no']); act(pg, ['close']); f = af(pg)
        check(f'{tag} answered No: confirmed, equal to the "fully paid" illustration (cash $1,559,600)', f['confirmed'] and f['cardCash'] == '$1,559,600' and '$1,987,500' in f['text'] and f['stagesOk'] is True and not stale(pg), [f['cardCash']])
        pg.locator('[data-chip="who"]').click(); pg.wait_for_selector('[data-del-home]', state='visible'); pg.locator('[data-del-home]:visible').first.click(); settle(pg); act(pg, ['opt', 'who', {'__homes': 1}]); act(pg, ['close']); f = af(pg)
        check(f'{tag} back to unanswered: the first screen returns exactly', pg.evaluate(SNAP) == ex_snap and not f['confirmed'], [k for k in ex_snap if pg.evaluate(SNAP)[k] != ex_snap[k]])
        clean(tag, 'answered and back', pg, errs); pg.close()
        # 3 / 4 first homes: confirmed at once, no illustration
        for nm, seq, absd in [('SC first home', [['price', '1,500,000']], None), ('PR first home', [['price', '1,500,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}]], 'ABSD 5%')]:
            pg, errs, st = run(ctx, seq); f = af(pg)
            check(f'{tag} {nm}: confirmed at once, nothing waits, no illustration', f['confirmed'] and not f['cols'] and f['known'] is None and f['stagesOk'] is True and not st, [f['confirmed'], st[:1]])
            check(f'{tag} {nm}: stamp duty as expected', ('ABSD' not in f['text']) if absd is None else (absd in f['text']), f['text'][:200])
            clean(tag, nm, pg, errs); pg.close()
        # 5 second home with a loan, answered
        pg, errs, st = run(ctx, [['price', '1,800,000'], ['opt', 'who', {'__homes': 1}], ['home', 0, 'mort', 'yes'], ['homeamt', 0, '2,500'], ['close']]); f = af(pg)
        check(f'{tag} second home with a loan: confirmed at 45% (bank loan $810,000), ABSD 20%', f['confirmed'] and '$810,000' in f['text'] and 'ABSD 20%' in f['text'] and f['stagesOk'] is True and not st, f['text'][:300])
        clean(tag, 'second home with a loan', pg, errs); pg.close()
        # 6 SC and PR buyers, first homes
        pg, errs, st = run(ctx, [['price', '2,100,000'], ['opt', 'who', {'n': '2'}], ['select', 'p.1.res', 'PR'], ['fill', 'p.1.age', '33'], ['close']]); f = af(pg)
        check(f'{tag} SC and PR buyers: their figures at once, nothing waits on a home loan', (f['confirmed'] or 'married' in f['text'].lower()) and f['known'] is None and not f['cols'] and not st, f['text'][:300])
        clean(tag, 'SC and PR buyers', pg, errs); pg.close()
        # 7 two borrowers: a home each, both unanswered (different owners: only "none" can be worked out); then a joint home
        pg, errs, st = run(ctx, [['price', '2,400,000'], ['opt', 'who', {'n': '2'}], ['close'], ['opt', 'who', {'__homes': 2}], ['home', 1, 'own', '1'], ['close']]); f = af(pg)
        check(f'{tag} two borrowers, a home each, both unanswered: known figures, only the "none" illustration, and what is missing is said', f['cols'] == ['If none has a loan'] and 'whose home it is' in f['text'] and f['known'] is not None and not f['confirmed'], [f['cols']])
        known(tag, 'two borrowers, a home each', f)
        pg.locator('[data-chip="who"]').click(); pg.wait_for_selector('[data-home="0"] button[data-hk="mort"]', state='visible')
        act(pg, ['home', 0, 'mort', 'yes']); act(pg, ['homeamt', 0, '2,000']); act(pg, ['home', 1, 'mort', 'yes']); act(pg, ['homeamt', 1, '1,800']); act(pg, ['close']); f = af(pg)
        check(f'{tag} two borrowers, a separate loan each, answered: confirmed at 35% (bank loan $840,000)', f['confirmed'] and '$840,000' in f['text'] and not stale(pg), f['text'][:300]); pg.close()
        pg, errs, st = run(ctx, [['price', '2,400,000'], ['opt', 'who', {'n': '2'}], ['close'], ['opt', 'who', {'__homes': 1}], ['close']]); f = af(pg)
        check(f'{tag} two borrowers, one joint home unanswered: both answers side by side, 75% / 45%', f['cols'] == ['If fully paid', 'If still being paid'] and f['limit'][0].startswith('75%') and f['limit'][1].startswith('45%'), [f['cols'], f['limit']])
        clean(tag, 'two borrowers', pg, errs); pg.close()
        # 8 a completed home, loan unanswered
        pg, errs, st = run(ctx, [['opt', 'pkind', {'pkind': 'completed'}], ['price', '2,650,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}], ['opt', 'who', {'__homes': 1}], ['close']]); f = af(pg)
        check(f'{tag} completed home, loan unanswered: option 1% $26,500 + exercise 4% $106,000 + BSD + ABSD = $1,029,600 upfront', f['known'] == '$1,029,600' and NS(f['up'][0]).startswith(NS('Option fee 1% $26,500')) and NS(f['up'][1]).startswith(NS('Exercising the option 4% $106,000')), [f['known'], f['up']])
        known(tag, 'completed home', f, 'completed'); clean(tag, 'completed home', pg, errs); pg.close()
        # 9 CPF 0 against CPF not entered: the same known figures and illustrations
        pg, errs, st = run(ctx, EX[:4]); f0 = af(pg); pg.close()
        pg, errs, st = run(ctx, EX); f1 = af(pg); pg.close()
        check(f'{tag} CPF 0 and CPF not entered: the same known figures, loans and cash; CPF used $0', f0['known'] == f1['known'] and f0['up'] == f1['up'] and f0['loan'] == f1['loan'] and f0['cash'] == f1['cash'] and f1['cpf'] == ['$0', '$0'], [f0['cash'], f1['cash']])
        # 10 rapid, and the order reversed
        pg, errs, st = run(ctx, [['opt', 'who', {'__homes': 1}], ['close'], ['opt', 'pkind', {'pkind': 'completed'}], ['price', '900,000'], ['opt', 'pkind', {'pkind': 'new'}], ['opt', 'who', {'n': '1', 'p.0.res': 'PR'}], ['close'], ['fill', 'cpf', '0'], ['close'], ['price', '2,650,000']], rapid=True)
        check(f'{tag} rapid changes, homes and CPF before the price: the same screen as the example', pg.evaluate(SNAP) == ex_snap, [k for k in ex_snap if pg.evaluate(SNAP)[k] != ex_snap[k]]); clean(tag, 'rapid', pg, errs); pg.close()
        ctx.close()
    br.close()
finally:
    srv.terminate()
print('answer-first-render: %d passed, %d failed' % (ok, fail))
raise SystemExit(1 if fail else 0)
