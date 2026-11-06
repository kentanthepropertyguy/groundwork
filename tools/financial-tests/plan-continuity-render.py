"""Calculator UX + Plan My Move continuity (Master Planning, 6 Nov 2026), in a real browser at 1440 and 390 (phone).
Run from the site folder:  python3 tools/financial-tests/plan-continuity-render.py   (BASE=<folder of the live release> adds the parity check)
A How much can I borrow?, a housing loan with no repayment (blank or $0): the repayment field is marked amber with the approved line under it, the answer
  waits (no loan figure, never $0 assumed), "Enter the repayment" takes the visitor to the field, and every mark goes as soon as a repayment is in.
  Single and joint borrowers, separate loans, a loan in both names, 1 and 2+ loans, clearing the field, changing the number of loans. With the repayment in,
  the answer is the live release's, word for word (BASE).
B Plan My Move: a step opened from the plan carries ?plan= (and ?j=1 for a calculator): "Part of your Plan My Move", the step it is, "Back to my plan" and
  the next step; the figures carry on (income, cash, CPF) and survive Back and Forward; back on the plan, the step done says what it found and the next
  step is pointed out. Opened directly (or from Calculators) a calculator is unchanged: no bar, a clean start, nothing kept for the plan. No bar on
  Research or the Map. A first visit to the plan page is unchanged. Clearing the figures clears the plan's results. No script error, no sideways scroll."""
import os, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BASE = os.environ.get('BASE')
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:400] if info != '' else ''))
def serve(folder):
    s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
    p = subprocess.Popen(['node', os.path.join(folder, 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(200):
        try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
        except OSError: time.sleep(0.05)
    return p, f'http://127.0.0.1:{P}'
srv, B = serve(SITE)
srv0, B0 = serve(BASE) if BASE else (None, None)
BLOCK = re.compile(r'googletagmanager|facebook\.net|connect\.facebook|onemap\.gov\.sg')
MSG = 'Enter your existing monthly housing loan repayment to calculate your borrowing amount.'
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
def page(ctx, url, errs):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(BLOCK, lambda r: r.fulfill(status=200, body=''))
    pg.goto(url); return pg
OUT = "(() => { const o = document.querySelector('[data-out]'); return o ? o.innerText.replace(/\\s+/g, ' ').trim() : ''; })()"
MARKS = "(() => ({ fields: [...document.querySelectorAll('.f3-needf')].map((h) => (h.querySelector('[data-k]') || {}).dataset ? h.querySelector('[data-k]').dataset.k : '?'), msgs: [...document.querySelectorAll('[data-needmsg]')].map((m) => m.textContent), wait: !!document.querySelector('[data-hl-wait]') }))()"
def typ(pg, k, v):
    el = pg.locator(f'input[data-k="{k}"]'); el.fill(v); el.dispatch_event('input'); el.dispatch_event('change')
def seg(pg, k, v): pg.locator(f'[data-k="{k}"] [data-v="{v}"]').click()
def settle(pg): pg.wait_for_function("() => !document.querySelector('[data-out]') || document.querySelector('[data-out]').innerText.trim().length > 0", timeout=10000)
def until(pg, js, ms=6000):
    try: pg.wait_for_function(js, timeout=ms); return True
    except Exception: return False
WAITING = "() => !!document.querySelector('[data-hl-wait]') && document.querySelectorAll('[data-needmsg]').length > 0"
def borrow_case(base_url, ctx, steps, errs):
    pg = page(ctx, base_url + '/tools/tdsr/', errs); pg.wait_for_selector('[data-out]')
    for s in steps: s(pg)
    settle(pg); return pg
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('1440', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            ctx = br.new_context(**kw); errs = []
            # ---------- A the missing repayment ----------
            one = [lambda pg: typ(pg, 'p.0.fixed', '9000'), lambda pg: seg(pg, 'p.0.hl', '1')]
            pg = borrow_case(B, ctx, one, errs); until(pg, WAITING); m = pg.evaluate(MARKS)
            check(f'{vn} single, 1 loan, repayment blank: the field marked amber with the approved line, the answer waiting', m['fields'] == ['p.0.hlAmt'] and m['msgs'] == [MSG] and m['wait'], m)
            o = pg.evaluate(OUT)
            check(f'{vn} ... no loan figure meanwhile (nothing assumed)', not re.search(r'\$\d', o) and 'Add the monthly repayment' in o, o[:200])
            check(f'{vn} ... amber: the field’s border is amber', 'rgb(217, 154, 43)' in pg.evaluate("getComputedStyle(document.querySelector('.f3-needf .f3-in')).borderColor"))
            pg.locator('[data-needgo]').click(); pg.wait_for_function("() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.k === 'p.0.hlAmt'", timeout=5000)
            check(f'{vn} "Enter the repayment" takes the visitor to the field', True)
            typ(pg, 'p.0.hlAmt', '0'); settle(pg); m = pg.evaluate(MARKS)
            check(f'{vn} $0 typed: still waiting (an outstanding loan is never taken as $0)', m['fields'] == ['p.0.hlAmt'] and m['wait'] and not re.search(r'\$\d', pg.evaluate(OUT)), m)
            typ(pg, 'p.0.hlAmt', '1,200'); pg.wait_for_function("() => !document.querySelector('[data-hl-wait]')", timeout=5000); m = pg.evaluate(MARKS)
            check(f'{vn} repayment entered: every mark gone and the answer shown', not m['fields'] and not m['msgs'] and not m['wait'] and re.search(r'\$\d', pg.evaluate(OUT)), m)
            got1 = pg.evaluate(OUT)
            typ(pg, 'p.0.hlAmt', ''); pg.wait_for_selector('[data-hl-wait]', timeout=5000); m = pg.evaluate(MARKS)
            check(f'{vn} field cleared: the warning comes back', m['fields'] == ['p.0.hlAmt'] and m['msgs'] == [MSG], m)
            seg(pg, 'p.0.hl', '0'); pg.wait_for_function("() => !document.querySelector('[data-hl-wait]')", timeout=5000); m = pg.evaluate(MARKS)
            check(f'{vn} loans set to None: the warning goes, the answer shows', not m['fields'] and not m['msgs'] and re.search(r'\$\d', pg.evaluate(OUT)), m)
            got0 = pg.evaluate(OUT)
            seg(pg, 'p.0.hl', '2'); pg.wait_for_selector('[data-hl-wait]', timeout=5000); m = pg.evaluate(MARKS)
            check(f'{vn} loans set to 2+: their repayment asked for again', m['fields'] == ['p.0.hlAmt'] and m['wait'], m)
            check(f'{vn} no sideways scroll while waiting', pg.evaluate(NOOVER)); pg.close()
            # joint borrowers: Person 2's loan, separate loans, a loan in both names
            two = [lambda pg: seg(pg, 'n', '2'), lambda pg: typ(pg, 'p.0.fixed', '9000'), lambda pg: typ(pg, 'p.1.fixed', '7000')]
            pg = borrow_case(B, ctx, two + [lambda pg: seg(pg, 'p.1.hl', '1')], errs); until(pg, WAITING); m = pg.evaluate(MARKS)
            check(f'{vn} two borrowers, Person 2’s loan blank: only Person 2’s repayment marked', m['fields'] == ['p.1.hlAmt'] and m['msgs'] == [MSG] and m['wait'], m)
            typ(pg, 'p.1.hlAmt', '900'); pg.wait_for_function("() => !document.querySelector('[data-hl-wait]')", timeout=5000)
            check(f'{vn} ... entered: marks gone', not pg.evaluate(MARKS)['fields']); got2 = pg.evaluate(OUT); pg.close()
            pg = borrow_case(B, ctx, two + [lambda pg: seg(pg, 'p.0.hl', '1'), lambda pg: typ(pg, 'p.0.hlAmt', '800'), lambda pg: seg(pg, 'p.1.hl', '1')], errs); until(pg, WAITING); m = pg.evaluate(MARKS)
            check(f'{vn} separate loans, one repayment in: only the missing one marked', m['fields'] == ['p.1.hlAmt'] and len(m['msgs']) == 1, m)
            typ(pg, 'p.1.hlAmt', '650'); pg.wait_for_function("() => !document.querySelector('[data-hl-wait]')", timeout=5000); got3 = pg.evaluate(OUT); pg.close()
            pg = borrow_case(B, ctx, two + [lambda pg: seg(pg, 'jl', '1')], errs); until(pg, WAITING); m = pg.evaluate(MARKS)
            check(f'{vn} a loan in both names, blank: its repayment marked', m['fields'] == ['jlAmt'] and m['msgs'] == [MSG] and m['wait'], m)
            typ(pg, 'jlAmt', '1500'); pg.wait_for_function("() => !document.querySelector('[data-hl-wait]')", timeout=5000)
            check(f'{vn} ... entered: marks gone', not pg.evaluate(MARKS)['fields']); got4 = pg.evaluate(OUT); pg.close()
            if B0:   # parity: the same entries on the live release give the same answer, word for word
                ctx0 = br.new_context(**kw); e0 = []
                for name, steps, got in [('1 loan, $1,200', one + [lambda pg: typ(pg, 'p.0.hlAmt', '1,200')], got1), ('no loan', one + [lambda pg: seg(pg, 'p.0.hl', '0')], got0),
                                         ('Person 2, $900', two + [lambda pg: seg(pg, 'p.1.hl', '1'), lambda pg: typ(pg, 'p.1.hlAmt', '900')], got2),
                                         ('separate, $800 + $650', two + [lambda pg: seg(pg, 'p.0.hl', '1'), lambda pg: typ(pg, 'p.0.hlAmt', '800'), lambda pg: seg(pg, 'p.1.hl', '1'), lambda pg: typ(pg, 'p.1.hlAmt', '650')], got3),
                                         ('both names, $1,500', two + [lambda pg: seg(pg, 'jl', '1'), lambda pg: typ(pg, 'jlAmt', '1500')], got4)]:
                    q = borrow_case(B0, ctx0, steps, e0); q.wait_for_function("() => /\\$\\d/.test(document.querySelector('[data-out]').innerText)", timeout=8000); want = q.evaluate(OUT); q.close()
                    check(f'{vn} parity with the live release: {name}', want == got, [want[:160], got[:160]])
                ctx0.close()
            ctx.close()

            # ---------- B Plan My Move ----------
            ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/#buy', errs); pg.wait_for_selector('#buy:not([hidden])')
            check(f'{vn} a first visit to the plan: unchanged (nothing marked done)', pg.locator('#buy .gw-step.done, [data-gw-plan-prog], .gw-next-tag').count() == 0)
            pg.locator('#buy a[href*="tools/tdsr/"]').click(); pg.wait_for_selector('[data-gw-plan]')
            check(f'{vn} buy step 1 opened from the plan: ?plan=buy and ?j=1', 'plan=buy' in pg.url and 'j=1' in pg.url and pg.url.endswith('#cash'), pg.url)
            bar = pg.locator('[data-gw-plan]').inner_text().replace('\n', ' ')
            check(f'{vn} "Part of your Plan My Move", step 1 of 4, Back to my plan, Next', 'Part of your Plan My Move' in bar and 'Step 1 of 4' in bar and 'Back to my plan' in bar and 'Next: Homes in budget' in bar, bar)
            check(f'{vn} Back to my plan goes to the buying plan', pg.locator('[data-gw-plan-back]').get_attribute('href').endswith('journey/#buy'))
            check(f'{vn} the header marks Plan My Move', pg.locator('.gw-nav .gw-links a[data-kpt-nav="journey"][aria-current="page"]').count() == 1 or pg.locator('.gw-nav .gw-links').count() == 0)
            check(f'{vn} the bar fits (no sideways scroll)', pg.evaluate(NOOVER))
            typ(pg, 'p.0.fixed', '9000'); typ(pg, 'cash', '300000'); typ(pg, 'cpf', '150000'); seg(pg, 'p.0.own', '0')
            pg.wait_for_function("() => (JSON.parse(sessionStorage.getItem('gw.plan.v1') || '{}').borrow || {}).budget > 0", timeout=8000)
            bud = pg.evaluate("JSON.parse(sessionStorage.getItem('gw.plan.v1')).borrow.budget")
            check(f'{vn} the budget on screen is the one kept for the plan', ('$' + format(int(bud // 1000 * 1000), ',')) in pg.evaluate(OUT).replace(' ', ' ') or ('$' + format(int(bud), ',')) in pg.evaluate(OUT), [bud, pg.evaluate(OUT)[:200]])
            pg.locator('[data-gw-plan-to="explore"]').first.click(); pg.wait_for_selector('[data-gw-plan]')
            check(f'{vn} the next step (Homes in budget) opens with the plan’s budget filled in ("From your plan")', until(pg, "() => [...document.querySelectorAll('input')].some((i) => i.value.replace(/\\D/g, '') === '" + str(int(bud)) + "') && /From your plan/.test(document.body.innerText)"), pg.url)
            pg.locator('[data-gw-plan-to="payments"]').first.click(); pg.wait_for_selector('[data-gw-plan]')
            vals = pg.evaluate("Object.fromEntries([...document.querySelectorAll('input[data-k]')].filter((e) => e.value).map((e) => [e.dataset.k, e.value]))")
            check(f'{vn} the payments step: the income, cash and CPF carried on (not asked again)', vals.get('cash') == '300,000' and vals.get('cpf') == '150,000' and vals.get('p.0.fixed') == '9,000', vals)
            check(f'{vn} ... and it is step 4 of 4, step 1 ticked', 'Step 4 of 4' in pg.locator('[data-gw-plan]').inner_text() and pg.locator('[data-gw-plan] li.done').count() >= 1)
            pg.go_back(); pg.wait_for_selector('[data-gw-plan]')
            check(f'{vn} Back: Homes in budget again, with its bar', 'Step 2 of 4' in pg.locator('[data-gw-plan]').inner_text())
            pg.go_back(); pg.wait_for_selector('[data-gw-plan]')
            vals = pg.evaluate("Object.fromEntries([...document.querySelectorAll('input[data-k]')].filter((e) => e.value).map((e) => [e.dataset.k, e.value]))")
            check(f'{vn} Back again: step 1, the bar and the figures as left', 'Step 1 of 4' in pg.locator('[data-gw-plan]').inner_text() and vals.get('cash') == '300,000', vals)
            pg.go_forward(); pg.wait_for_selector('[data-gw-plan]'); pg.go_forward(); pg.wait_for_selector('[data-gw-plan]')
            check(f'{vn} Forward twice: the payments step again, with its bar', 'Step 4 of 4' in pg.locator('[data-gw-plan]').inner_text())
            pg.locator('[data-gw-plan-back]').click(); pg.wait_for_selector('#buy:not([hidden]) [data-gw-plan-prog]')
            s1 = pg.locator('#buy .gw-step').nth(0); prog = pg.locator('#buy [data-gw-plan-prog]').inner_text()
            check(f'{vn} back on the plan: step 1 ticked with its budget', 'done' in (s1.get_attribute('class') or '') and ('Budget about $' + format(int(bud // 1000 * 1000), ',')) in s1.inner_text(), s1.inner_text()[:200])
            check(f'{vn} ... the next step pointed out (Research, the one not yet opened), and the progress line', pg.locator('#buy .gw-step.next h3').inner_text().startswith('Next') and 'Research the developments' in pg.locator('#buy .gw-step.next').inner_text() and '3 of 4 steps done' in prog, prog)
            check(f'{vn} ... no sideways scroll', pg.evaluate(NOOVER))
            # the selling plan and the moving plans
            for panel, pre, first, want in [('sell', None, 'a[href*="journey/worth/"]', ('plan=sell', 'Step 1 of 3', 'journey/#sell')),
                                            ('move', 'hdb', 'a[href*="tools/hdb-upgrade/"]', ('plan=move-hdb', 'Step 2 of 3', 'journey/#move')),
                                            ('move', 'condo', 'a[href*="tools/sale-proceeds/"]', ('plan=move-condo', 'Step 2 of 4', 'journey/#move')),
                                            ('move', 'landed', 'a[href*="tools/tdsr/"]', ('plan=move-landed', 'Step 3 of 4', 'journey/#move')),
                                            ('up', None, 'a[href*="tools/hdb-upgrade/"]', ('plan=up', 'Step 1 of 2', 'journey/#up'))]:
                pg.goto(B + '/journey/#' + panel); pg.wait_for_selector(f'#{panel}:not([hidden])')
                if pre: pg.locator(f'#{panel} [data-gw-q="type"][data-gw-v="{pre}"]').click(); pg.wait_for_selector(f'#{panel} [data-gw-out] .gw-step')
                pg.locator(f'#{panel} {first}').first.click(); pg.wait_for_selector('[data-gw-plan]')
                t = pg.locator('[data-gw-plan]').inner_text()
                check(f'{vn} {panel}{"/" + pre if pre else ""}: {want[0]}, {want[1]}, back to {want[2]}', want[0] in pg.url and want[1] in t and 'Part of your Plan My Move' in t and pg.locator('[data-gw-plan-back]').get_attribute('href').endswith(want[2]) and pg.locator('[data-gw-strip]:not([data-gw-plan])').count() == 0, [pg.url, t[:120]])
            # standalone: unchanged and clean
            pg.goto(B + '/tools/tdsr/'); pg.wait_for_selector('[data-out]')
            vals = pg.evaluate("[...document.querySelectorAll('input[data-k]')].filter((e) => e.value).map((e) => e.dataset.k)")
            check(f'{vn} a calculator opened directly: no plan bar, a clean start', pg.locator('[data-gw-plan]').count() == 0 and not vals and pg.locator('.gw-crumb').is_visible(), vals)
            before = pg.evaluate("sessionStorage.getItem('gw.plan.v1')"); typ(pg, 'p.0.fixed', '5000'); settle(pg)
            check(f'{vn} ... and nothing it works out is kept for the plan', pg.evaluate("sessionStorage.getItem('gw.plan.v1')") == before)
            pg.goto(B + '/tools/'); pg.wait_for_selector('main a[href*="tdsr"]'); pg.locator('main a[href*="tdsr"]').first.click(); pg.wait_for_selector('[data-out]')
            check(f'{vn} from Calculators: no plan, no journey marker', 'plan=' not in pg.url and 'j=1' not in pg.url and pg.locator('[data-gw-plan]').count() == 0, pg.url)
            for u in ['/research/?plan=buy', '/research/map/?plan=buy']:
                pg.goto(B + u); pg.wait_for_timeout(0); pg.wait_for_load_state('load')
                check(f'{vn} {u}: no plan bar (Research and the Map unchanged)', pg.locator('[data-gw-plan]').count() == 0 and not pg.evaluate("document.documentElement.classList.contains('gw-onpath')"))
            # Start fresh: the plan's result for that step goes with the figures
            pg.goto(B + '/tools/tdsr/?j=1&plan=buy#cash'); pg.wait_for_selector('[data-gw-plan]'); typ(pg, 'p.0.fixed', '9100')
            pg.wait_for_function("() => (JSON.parse(sessionStorage.getItem('gw.plan.v1') || '{}').borrow || {}).loan > 0", timeout=8000)
            pg.reload(); pg.wait_for_selector('[data-fresh]', state='visible', timeout=8000); pg.locator('[data-fresh]').click(); pg.wait_for_load_state('load'); pg.wait_for_selector('[data-out]')
            pg.wait_for_function("() => !(JSON.parse(sessionStorage.getItem('gw.plan.v1') || '{}').borrow)", timeout=8000)
            check(f'{vn} "Start fresh" also clears what the plan kept for that step', True)
            check(f'{vn} no script error', not errs, errs[:3])
            ctx.close()
        br.close()
finally:
    srv.terminate()
    if srv0: srv0.terminate()
print(f'plan-continuity-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
