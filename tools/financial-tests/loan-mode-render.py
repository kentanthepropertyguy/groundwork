"""Loan selection and progressive mortgage (1 Nov 2026): What will this home cost me?, desktop 1440, phone 390 and 200% zoom (195).
Run from the site folder:  python3 tools/financial-tests/loan-mode-render.py
 Mode A "I know my loan": a % or an amount, kept in step (a % keeps its % when the price changes, an amount keeps its dollars); above the buyer's limit the
   requested loan is named and the limit is what is used, never shown as allowed; within it, "not checked against income" until age and income are in.
 Mode B "From my income": GW_FIN3.cost's own income-supported loan within the limit, "not a bank approval"; without age or income, the limit's figures stay and
   what is missing is named.
 Both feed the one progressive engine: every construction stage (bank payment and the mortgage after it, $0 before the bank starts) equals GW_CALC.progressive
 computed independently in the page; from TOP and the CSC alternative stay. While a home-loan answer is incomplete, the breakdown shows each supported
 illustration, labelled; a loan answered Yes without its repayment has no "fully paid" column. Every change updates everything; nothing stale."""
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

import json as _j
STG = ['foundation', 'frame', 'walls', 'roof', 'fittings', 'roads', 'top', 'csc']
PAR = """(a)=>{const C=window.GW_CALC;const r=C.progressive(Object.assign({kind:'private',build:true},a));if(!r.ok)return {err:JSON.stringify(r).slice(0,200)};const ids=%s;return {loan:Math.round(r.loanMax),ltv:r.ltv,rows:r.stages.filter(s=>ids.indexOf(s.id)>=0).map(s=>[s.id,Math.round(s.loan||0),Math.round((s.monthly>0.5?s.monthly:0))]),fromTop:Math.round(r.finalMonthly)}}""" % _j.dumps(STG)
MST = """()=>[...document.querySelectorAll('[data-bd-out] [data-mst]')].map(r=>[r.dataset.mst,...[...r.querySelectorAll('td')].map(td=>Math.round(+td.textContent.replace(/[^0-9.]/g,'')))])"""
def parity(pg, args):
    e = pg.evaluate(PAR, args); return e
def stages(pg): return pg.evaluate(MST)
def loaded(ctx, raw, homes=None):
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(B + '/tools/payment-planner/'); pg.wait_for_selector('[data-out]')
    pg.evaluate("s=>{sessionStorage.clear();sessionStorage.setItem('gw.fin3.pay.v1',JSON.stringify(s))}", {'v': 3, 'raw': raw, 'loans': [], 'homes': homes or []})
    pg.reload(); pg.wait_for_selector('[data-out]'); settle(pg); return pg, errs
def outt(pg): return re.sub(r'\s+', ' ', pg.evaluate("()=>document.querySelector('[data-out]').textContent"))
def fld(pg, k): return pg.evaluate("k=>document.querySelector('[data-k=\"'+k+'\"]').value", k)
BASE = {'price': '2,650,000', 'pkind': 'new', 'n': '1', 'p.0.res': 'SC', 'p.0.age': '35'}
H = lambda m, a='': [{'own': '0', 'type': 'hdb', 'act': 'keep', 'mort': m, 'amt': a}]
def same_rows(tag, name, pg, args, ltv=None):
    e = parity(pg, args); s = stages(pg)
    ok = 'err' not in e and s == [[r[0], r[1], r[2]] for r in e['rows']] and len(s) == 8
    check(f'{tag} {name}: all 8 construction stages, each bank payment and the mortgage after it equal GW_CALC.progressive', ok, [s, e])
    if ltv is not None: check(f'{tag} {name}: the {int(ltv*100)}% limit', abs(e.get('ltv', 0) - ltv) < 1e-9, e.get('ltv'))
    return e
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for tag, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        ctx = br.new_context(**kw); ctx.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        print('--', tag)
        # 1-3 Mode A through the Loan control: a % typed, then the price changed, then an amount typed, then the price changed
        pg, errs, st = run(ctx, [['price', '2,650,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'SC'}], ['fill', 'p.0.age', '35'], ['close'], ['opt', 'loan', {'loanMode': 'manual'}], ['fill', 'loanPct', '75'], ['close']])
        check(f'{tag} Mode A: 75% typed gives $1,987,500 in the amount, and every step recalculated in full', fld(pg, 'loanAmt') == '1,987,500' and not st, [fld(pg, 'loanAmt'), st[:1]])
        t = outt(pg)
        check(f'{tag} Mode A, first home: "Your chosen loan, 75%: within the limit, not checked against income"', 'Your chosen loan, 75% of the price: within the 75% limit, not checked against income' in t and 'Loan $1.98m' in pg.inner_text('[data-chip="loan"]'), t[:400])
        same_rows(tag, 'Mode A 75%, first home', pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'SC', 'owned': 0}], 'loanCap': 1987500}, 0.75)
        act(pg, ['price', '3,000,000']); act(pg, ['close']); settle(pg)
        check(f'{tag} Mode A: the price changed, the 75% is kept and the amount follows ($2,250,000)', fld(pg, 'loanPct') == '75' and fld(pg, 'loanAmt') == '2,250,000' and not stale(pg), [fld(pg, 'loanPct'), fld(pg, 'loanAmt')])
        act(pg, ['fill', 'loanAmt', '1,500,000']); act(pg, ['close']); settle(pg)
        check(f'{tag} Mode A: an amount typed, the % follows (50%)', fld(pg, 'loanPct') == '50' and fld(pg, 'loanAmt') == '1,500,000', [fld(pg, 'loanPct'), fld(pg, 'loanAmt')])
        act(pg, ['price', '2,500,000']); act(pg, ['close']); settle(pg)
        check(f'{tag} Mode A: the price changed, the amount is kept and the % follows (60%)', fld(pg, 'loanAmt') == '1,500,000' and fld(pg, 'loanPct') == '60' and not stale(pg), [fld(pg, 'loanPct'), fld(pg, 'loanAmt')])
        same_rows(tag, 'Mode A $1,500,000', pg, {'price': 2500000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'SC', 'owned': 0}], 'loanCap': 1500000})
        act(pg, ['fill', 'loanPct', '120']); act(pg, ['close']); settle(pg)
        check(f'{tag} Mode A: 120% is refused beside the field, never used', 'between 0% and 100%' in pg.inner_text('[data-err="loanPct"]') if pg.locator('[data-err="loanPct"]:visible').count() else 'between 0% and 100%' in pg.evaluate("()=>document.querySelector('[data-err=loanPct]').textContent"), pg.evaluate("()=>document.querySelector('[data-err=loanPct]').textContent"))
        act(pg, ['opt', 'loan', {'loanMode': 'income'}]); settle(pg)
        check(f'{tag} back to "From my income": the typed loan is cleared and the engine sizes it', fld(pg, 'loanAmt') == '' and fld(pg, 'loanPct') == '' and 'Not sized from your income yet' in outt(pg), outt(pg)[:300]); clean_errs = errs; pg.close()
        # 4 a 45% loan typed, first home: the buyer pays the early stages, the bank $0 there
        pg, errs = loaded(ctx, dict(BASE, loanMode='manual', loanPct='45', loanBy='pct'))
        e = same_rows(tag, 'Mode A 45%', pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'SC', 'owned': 0}], 'loanCap': 1192500})
        check(f'{tag} Mode A 45%: $0 bank payment and $0 mortgage at the stages before the first release', stages(pg)[0][1:] == [0, 0], stages(pg)[:2]); pg.close()
        # 5 requested against allowed: 75% typed with one housing loan already (45% limit)
        pg, errs = loaded(ctx, dict(BASE, **{'p.0.res': 'PR', 'loanMode': 'manual', 'loanPct': '75', 'loanBy': 'pct', 'ownAny': 'yes'}), H('yes', '2,500'))
        t = outt(pg)
        check(f'{tag} 75% asked with a housing loan already: the request is named, 45% ($1,192,500) is used, "not available"', 'Above the loan limit. You asked for $1,987,500 (75%)' in t and 'banks lend up to 45% here ($1,192,500)' in t and 'the 75% loan is not available' in t and 'On a $1,192,500 loan' in t, t[:600])
        same_rows(tag, 'requested 75%, allowed 45%', pg, {'price': 2650000, 'age': 35, 'loans': 1, 'buyers': [{'res': 'PR', 'owned': 1}], 'loanCap': 1987500}, 0.45)
        # Ken (1 Nov 2026): in the Loan menu the requested 75% is marked as requested (no tick), beside the applicable 45%; the field keeps 75 and stays editable
        OPT = """(lab)=>{const b=[...document.querySelectorAll('[data-optl="loan"] .f3-opt')].find(x=>x.querySelector('.f3-ol').textContent.trim()===lab);if(!b)return null;return {sel:b.classList.contains('sel'),req:b.classList.contains('req'),pressed:b.getAttribute('aria-pressed'),tick:getComputedStyle(b.querySelector('.f3-ol'),'::after').content,sub:(b.querySelector('.f3-os')||{}).textContent||''}}"""
        pg.click('[data-chip="loan"]'); pg.wait_for_selector('[data-optl="loan"] .f3-opt'); o75 = pg.evaluate(OPT, '75% of the price'); okm = pg.evaluate(OPT, 'I know my loan')
        check(f'{tag} menu, 75% asked over a 45% limit: requested, not selected; no tick; "Requested: 75% · Applicable limit: 45% ($1,192,500 is used)"', o75 and o75['req'] and not o75['sel'] and o75['pressed'] == 'false' and '✓' not in o75['tick'] and o75['sub'] == 'Requested: 75% · Applicable limit: 45% ($1,192,500 is used)', o75)
        check(f'{tag} menu, "I know my loan" (no tick while over the limit): "Requested: 75% ($1,987,500) · Applicable limit: 45% ($1,192,500)"', okm and okm['req'] and not okm['sel'] and '✓' not in okm['tick'] and okm['sub'] == 'Requested: 75% ($1,987,500) · Applicable limit: 45% ($1,192,500)', okm)
        check(f'{tag} the requested 75% stays in the field, editable; the warning stays; the capped loan is used', fld(pg, 'loanPct') == '75' and pg.locator('[data-k="loanPct"]').first.is_editable() and 'Above the loan limit. You asked for $1,987,500 (75%)' in outt(pg) and 'On a $1,192,500 loan' in outt(pg))
        act(pg, ['fill', 'loanPct', '45']); settle(pg); pg.evaluate("()=>window.__f3OpenChip('loan')"); pg.wait_for_timeout(150); o45 = pg.evaluate(OPT, '45% of the price'); o75b = pg.evaluate(OPT, '75% of the price')
        check(f'{tag} menu, 45% typed (within the limit): the normal selected style with its tick; 75% back to an unselected choice', o45 and o45['sel'] and not o45['req'] and '✓' in o45['tick'] and o75b and not o75b['sel'] and not o75b['req'] and o75b['sub'].startswith('Above your 45% limit'), [o45, o75b])
        check(f'{tag} 45% typed: no warning, the same $1,192,500 loan', 'Above the loan limit' not in outt(pg) and 'On a $1,192,500 loan' in outt(pg)); pg.close()
        pg, errs = loaded(ctx, dict(BASE, loanMode='manual', loanPct='75', loanBy='pct'))
        pg.click('[data-chip="loan"]'); pg.wait_for_selector('[data-optl="loan"] .f3-opt'); o75 = pg.evaluate(OPT, '75% of the price')
        check(f'{tag} menu, 75% on a first home (eligible): the normal selected style with its tick, no "requested" mark', o75 and o75['sel'] and not o75['req'] and '✓' in o75['tick'] and 'Requested' not in o75['sub'], o75); pg.close()
        # 6 second home fully paid: 75% typed is within the limit
        pg, errs = loaded(ctx, dict(BASE, **{'p.0.res': 'PR', 'loanMode': 'manual', 'loanPct': '75', 'loanBy': 'pct', 'ownAny': 'yes'}), H('no'))
        check(f'{tag} 75% asked, second home fully paid: within the limit, nothing capped', 'You asked for' not in outt(pg) and 'On a $1,987,500 loan' in outt(pg))
        same_rows(tag, 'second home fully paid, 75%', pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'PR', 'owned': 1}], 'loanCap': 1987500}, 0.75); pg.close()
        # 7 third home, both fully paid; and two loans already (35%)
        pg, errs = loaded(ctx, dict(BASE, ownAny='yes'), H('no') + H('no'))
        check(f'{tag} third home, both fully paid: ABSD 30% and the breakdown with every stage', 'ABSD 30%' in outt(pg) and len(stages(pg)) == 8 and not pg.evaluate("()=>document.querySelector('[data-bd]').hidden")); pg.close()
        pg, errs = loaded(ctx, dict(BASE, ownAny='yes'), H('yes', '1,500') + H('yes', '2,000'))
        same_rows(tag, 'two housing loans already', pg, {'price': 2650000, 'age': 35, 'loans': 2, 'buyers': [{'res': 'SC', 'owned': 2}]}, 0.35); pg.close()
        # 8 Mode B: income-limited, and income missing
        pg, errs = loaded(ctx, dict(BASE, **{'p.0.fixed': '12,000'}))
        t = outt(pg); cap = pg.evaluate("()=>{const m=document.querySelector('[data-out]').textContent.match(/Sized from your income: about \\$([\\d,]+)/);return m?+m[1].replace(/,/g,''):null}")
        check(f'{tag} Mode B, $12,000 a month at 35: sized from income below the limit, "tested at 4% (MAS)", "not a bank approval"', cap and cap < 1987500 and 'tested at 4% (MAS)' in t and 'Not a bank approval' in t and pg.inner_text('[data-chip="loan"]').strip() == 'Loan from income', t[:500])
        same_rows(tag, 'Mode B income-limited', pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'SC', 'owned': 0}], 'loanCap': cap or 0}); pg.close()
        pg, errs = loaded(ctx, {'price': '2,650,000', 'pkind': 'new', 'n': '1', 'p.0.res': 'SC', 'p.0.fixed': '12,000'})   # income without an age
        t = outt(pg)
        check(f'{tag} Mode B, no age or income: the limit\'s figures stay, "not sized from your income yet", and what is missing is named', 'The most the 75% limit allows. Not sized from your income yet.' in t and 'Add age' in t and 'Sized from your income' not in t and '$1,987,500' in t, t[:400]); pg.close()
        # 9 two buyers, a joint home with a loan, Mode B with both incomes
        pg, errs = loaded(ctx, {'price': '2,650,000', 'pkind': 'new', 'n': '2', 'p.0.res': 'SC', 'p.1.res': 'SC', 'p.0.age': '38', 'p.1.age': '36', 'p.0.fixed': '15,000', 'p.1.fixed': '12,000', 'ownAny': 'yes'}, [{'own': 'both', 'type': 'hdb', 'act': 'keep', 'mort': 'yes', 'amt': '2,000'}])
        t = outt(pg)
        check(f'{tag} two buyers with a joint housing loan: the 45% limit, sized within it, never above', 'On a $' in t and pg.evaluate("()=>document.querySelector('[data-bd]').hidden") is False and len(stages(pg)) == 8 and ('within the 45% limit' in t or 'supports the most the 45% limit' in t), t[:500]); pg.close()
        # 10 a home-loan answer incomplete: each illustration's full breakdown, labelled; Yes without its repayment: no "fully paid" column
        pg, errs = loaded(ctx, {'price': '2,650,000', 'pkind': 'new', 'n': '1', 'p.0.res': 'PR', 'cpf': '0', 'ownAny': 'yes'}, H(''))
        cols = pg.evaluate("()=>[...document.querySelectorAll('[data-bd-col] > .f3-sgt')].map(x=>x.textContent)"); sm = pg.evaluate("()=>document.querySelector('[data-bd-sum]').textContent")
        check(f'{tag} unanswered: the breakdown shows both answers one after another, labelled as illustrations, 8 stages each; nothing confirmed', cols == ['If fully paid', 'If still being paid'] and '(illustration)' in sm and len(stages(pg)) == 16 and pg.locator('[data-out] [data-answer]').count() == 0 and pg.locator('[data-bd-illus]').count() == 1, [cols, sm, len(stages(pg))])
        s = stages(pg); e75 = parity(pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'PR', 'owned': 1}]}); e45 = parity(pg, {'price': 2650000, 'age': 35, 'loans': 1, 'buyers': [{'res': 'PR', 'owned': 1}]})
        check(f'{tag} unanswered: both illustrated schedules equal GW_CALC.progressive at 75% and 45%', s[:8] == [list(r) for r in e75['rows']] and s[8:] == [list(r) for r in e45['rows']], [s[:2], e75['rows'][:2], s[8:10], e45['rows'][:2]]); pg.close()
        pg, errs = loaded(ctx, {'price': '2,650,000', 'pkind': 'new', 'n': '1', 'p.0.res': 'PR', 'cpf': '0', 'ownAny': 'yes'}, H('yes'))
        cols = pg.evaluate("()=>[...document.querySelectorAll('[data-bd-col] > .f3-sgt')].map(x=>x.textContent)")
        check(f'{tag} Yes without its repayment: one breakdown, "With the loan still being paid", 45%; no fully-paid option; nothing confirmed', cols == ['With the loan still being paid'] and len(stages(pg)) == 8 and 'If fully paid' not in outt(pg) and pg.locator('[data-out] [data-answer]').count() == 0, cols); pg.close()
        # 11 rate and tenure: every stage instalment follows at once
        pg, errs, st = run(ctx, [['price', '2,650,000'], ['opt', 'who', {'n': '1', 'p.0.res': 'SC'}], ['fill', 'p.0.age', '35'], ['close'], ['opt', 'loan', {'loanMode': 'manual'}], ['fill', 'loanPct', '75'], ['close'], ['opt', 'rate', {'ratePct': '3'}], ['opt', 'rate', {'years': '25'}]])
        check(f'{tag} rate 3% and 25 years: recalculated at once, every step', not st, st[:1])
        same_rows(tag, '3%, 25 years', pg, {'price': 2650000, 'age': 35, 'loans': 0, 'buyers': [{'res': 'SC', 'owned': 0}], 'loanCap': 1987500, 'ratePct': 3, 'years': 25})
        a, b, f = end(pg); check(f'{tag} the screen equals the same entries drawn afresh', a == b, [k for k in a if a[k] != b[k]])
        check(f'{tag} no script error, NaN or undefined; no sideways scroll', not errs and not re.search(r'NaN|undefined', a['out'] + a['bd']) and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), errs[:2]); pg.close()
        ctx.close()
    # 12 200% zoom: the breakdown's stage table and the illustration columns stay inside the card
    ctx = br.new_context(viewport={'width': 195, 'height': 422}, is_mobile=True, has_touch=True); ctx.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    for name, raw, homes in [('typed 75% capped at 45%', dict(BASE, **{'p.0.res': 'PR', 'loanMode': 'manual', 'loanPct': '75', 'loanBy': 'pct', 'ownAny': 'yes'}), H('yes', '2,500')), ('unanswered', {'price': '2,650,000', 'pkind': 'new', 'n': '1', 'p.0.res': 'PR', 'ownAny': 'yes'}, H(''))]:
        pg, errs = loaded(ctx, raw, homes); pg.evaluate("()=>{const d=document.querySelector('[data-bd]');d.open=true}"); pg.wait_for_timeout(200)
        bad = pg.evaluate("()=>{const card=document.querySelector('.f3-out').getBoundingClientRect();return [...document.querySelectorAll('[data-out] .f3-ar, [data-bd-out] .f3-rl')].filter(e=>e.getBoundingClientRect().right>card.right+1).map(e=>e.textContent.slice(0,30))}")
        check(f'zoom 195 {name}: rows stay inside the card; tables scroll in their own box; no sideways page scroll', not bad and pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), bad); pg.close()
    ctx.close(); br.close()
finally:
    srv.terminate()
print('loan-mode-render: %d passed, %d failed' % (ok, fail))
raise SystemExit(1 if fail else 0)
