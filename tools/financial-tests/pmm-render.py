"""Plan My Move V2, the guided journey (Master Planning, 6 Nov 2026), in a real browser at 1440 (desktop), 390 and 360 (phones).
Run from the site folder:  python3 tools/financial-tests/pmm-render.py
 1 first visit: one shell, Step 1 of 4, four steps shown, Back off, Continue on; nothing marked done
 2 Continue with answers missing: the step stays, each missing answer is marked amber with its line, the count is said, the first one is focused
 3 upgrade, two buyers, an HDB flat with a loan: no repayment = the approved line, never taken as $0; with it, on to My Budget
 4 My Budget: the budget, loan, cash and sale on screen are GW_ENGINE's own answers for the same answers (in the page); figures update as they change
 5 reload: the same step, the answers and the budget as left; browser Back and Forward move between steps
 6 My Options: a home's cash, loan and instalment are GW_ENGINE's cost for it; within / above the budget
 7 Budget Search from the journey: ?plan=v2, "Part of your Plan My Move · Step 3 of 4", the budget filled in; Back to my plan = My Options, nothing lost
 8 My Plan: the summary (budget, sale, homes, next steps without figures), Save as PDF (the sheet's figures = the screen's), Ken's link without figures
 9 keeping a home with CPF: the balances asked for, then the budget = GW_ENGINE's; "not sure" of the type: both budgets, the lower leads
10 guards: a later step cannot open before the earlier ones; older links (#up, #sell, #own) land where they should; Start again clears everything
11 the standalone calculators are unchanged: no plan bar, a clean start, the journey's answers not used
Throughout: no script error, no sideways scroll."""
import os, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
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
BLOCK = re.compile(r'googletagmanager|facebook\.net|connect\.facebook|onemap\.gov\.sg')
MSG = 'Enter your existing monthly housing loan repayment to calculate your borrowing amount.'
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
def page(ctx, url, errs):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(BLOCK, lambda r: r.fulfill(status=200, body=''))
    pg.goto(url); return pg
def chip(pg, k, v): pg.locator(f'[data-pmm] [data-k="{k}"] [data-v="{v}"]').click()
def typ(pg, k, v): pg.locator(f'[data-pmm] input[data-k="{k}"]').fill(v)
def step(pg): return pg.evaluate("location.hash.slice(1)")
def nxt(pg): pg.locator('[data-pmm] [data-next]').click()
def at(pg, st): pg.wait_for_function(f"() => location.hash === '#{st}' && !!document.querySelector('[data-pmm] [data-step] .pmm-t') && document.querySelector('[data-pmm] [data-step] .pmm-t').textContent.length > 0", timeout=8000)
def money(n): return '$' + format(int(round(n)), ',')
STATE = "JSON.parse(sessionStorage.getItem('gw.pmm.v2') || '{}')"
# GW_ENGINE's own answer for the journey's saved answers, in the page
ENG = "((t, price) => { const a = " + STATE + ".a; const b = GW_ENGINE.afford(GW_PMM.caseOf(a, t)); const s = GW_ENGINE.sale(GW_PMM.caseOf(a, t)); const c = price ? GW_ENGINE.cost(GW_PMM.caseOf(a, t, price)) : null; return { status: b.status, budget: b.figures && b.figures.budget, top: b.value && b.value.top, sale: s.status === 'ok' ? s.figures.total : null, cost: c && c.value }; })"
NEEDS = "[...document.querySelectorAll('[data-pmm] .pmm-needf')].filter((q) => !q.closest('[hidden]')).map((q) => q.dataset.q)"
def needmsg(pg, k): return pg.locator(f'[data-pmm] [data-need-for="{k}"]').inner_text()
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('1440', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('360', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True))]:
            ctx = br.new_context(**kw); errs = []
            # 1 first visit
            pg = page(ctx, B + '/journey/', errs); pg.wait_for_selector('[data-pmm] .pmm-card [data-next]')
            check(f'{vn} 1 first visit: one shell, Step 1 of 4, My Situation, four steps, Back off, Continue on', pg.locator('[data-pmm] [data-k-step]').inner_text() == 'Step 1 of 4' and pg.locator('[data-pmm] .pmm-t').inner_text() == 'My Situation'
                  and pg.locator('[data-pmm] .pmm-steps li').count() == 4 and pg.locator('[data-pmm] [data-back]').is_disabled() and pg.locator('[data-pmm] [data-next]').is_visible() and step(pg) == 'situation')
            check(f'{vn} 1 ... the page is Plan My Move; no checklist panel; nothing marked done', 'Plan My Move' in pg.title() and pg.locator('[data-gw-panel]').count() == 0 and pg.locator('[data-pmm] .done').count() == 0)
            check(f'{vn} 1 ... the journey panel: four steps with their lines on desktop, hidden on a phone', pg.locator('[data-pmm] .pmm-side [data-sj]').count() == 4 and (pg.locator('[data-pmm] .pmm-side ol').is_visible() == (vn == '1440')))
            check(f'{vn} 1 ... no sideways scroll', pg.evaluate(NOOVER))
            # 2 Continue with answers missing
            nxt(pg); pg.wait_for_selector('[data-pmm] .pmm-needf')
            n = pg.evaluate(NEEDS)
            check(f'{vn} 2 Continue with nothing answered: stays on My Situation, the four missing answers marked', step(pg) == 'situation' and n == ['sit', 'n', 'p0age', 'p0inc'], n)
            check(f'{vn} 2 ... amber, its line under it, the count said, the first one focused', 'rgb(' in pg.evaluate("getComputedStyle(document.querySelector('[data-pmm] .pmm-needf .pmm-need')).color") and needmsg(pg, 'sit') == 'Choose your situation.'
                  and '4 answers' in pg.locator('[data-pmm] [data-why]').inner_text() and pg.evaluate("!!document.activeElement.closest('[data-q=\"sit\"]')"), pg.locator('[data-pmm] [data-why]').inner_text())
            chip(pg, 'sit', 'upgrade')
            check(f'{vn} 2 ... answering clears the marks', pg.evaluate(NEEDS) == [] and pg.locator('[data-pmm] [data-why]').inner_text() == '')
            # 3 upgrade, two buyers, HDB with a loan
            chip(pg, 'n', '2'); typ(pg, 'p0age', '40'); typ(pg, 'p0inc', '9000'); typ(pg, 'p1age', '38'); typ(pg, 'p1inc', '7000')
            chip(pg, 'htype', 'hdb'); chip(pg, 'hown', 'both'); chip(pg, 'hloan', 'yes')
            check(f'{vn} 3 the home you own: shown for an upgrade, with Owned by for two buyers', pg.locator('[data-pmm] [data-q="hown"]').is_visible() and pg.locator('[data-pmm] [data-q="hmo"]').is_visible())
            nxt(pg); pg.wait_for_selector('[data-pmm] .pmm-needf')
            check(f'{vn} 3 a home loan with no repayment: only the repayment marked, in the approved words', pg.evaluate(NEEDS) == ['hmo'] and needmsg(pg, 'hmo') == MSG and step(pg) == 'situation', pg.evaluate(NEEDS))
            typ(pg, 'hmo', '0'); nxt(pg); pg.wait_for_selector('[data-pmm] .pmm-needf')
            check(f'{vn} 3 ... $0 typed: still asked for (an outstanding loan is never taken as $0)', pg.evaluate(NEEDS) == ['hmo'] and step(pg) == 'situation')
            typ(pg, 'hmo', '1,200'); chip(pg, 'when', '1'); nxt(pg); at(pg, 'budget')
            check(f'{vn} 3 ... with it: on to My Budget, Step 2 of 4, step 1 ticked', pg.locator('[data-pmm] [data-k-step]').inner_text() == 'Step 2 of 4' and 'done' in (pg.locator('[data-pmm] .pmm-steps li').nth(0).get_attribute('class') or ''))
            # 4 My Budget
            check(f'{vn} 4 nothing entered: no budget figure, the answers it waits for listed', pg.locator('[data-pmm] [data-wait]').is_visible() and pg.locator('[data-pmm] [data-budget]').count() == 0)
            bw = pg.locator('[data-pmm] [data-borrow]')
            check(f'{vn} 4 ... what banks may lend on the income, meanwhile (GW_ENGINE borrow)', bw.count() == 1 and bw.inner_text() == money(pg.evaluate("GW_ENGINE.borrow(GW_PMM.caseOf(" + STATE + ".a, 'completed')).figures.maxLoan")))
            chip(pg, 'ptype', 'new'); typ(pg, 'cash', '100000'); typ(pg, 'cpf', '80000'); typ(pg, 'sprice', '700000'); typ(pg, 'sloan', '150000')
            check(f'{vn} 4 the sale without its CPF refund: still no budget (the sale is not guessed)', pg.locator('[data-pmm] [data-budget]').count() == 0)
            typ(pg, 'scpf', '260000'); pg.wait_for_selector('[data-pmm] [data-budget]')
            e = pg.evaluate(ENG + "('new')"); shown = pg.locator('[data-pmm] [data-budget]').inner_text()
            check(f'{vn} 4 the budget on screen is GW_ENGINE’s for the same answers', e['status'] == 'ok' and shown == money(e['budget']), [shown, e])
            rows = pg.locator('[data-pmm] .pmm-ans').inner_text()
            check(f'{vn} 4 ... the loan, the cash upfront and the sale are GW_ENGINE’s too', money(e['top']['loan']) in rows and money(e['top']['cashNeed']) in rows and pg.locator('[data-pmm] [data-sale]').inner_text() == money(e['sale']), rows[:300])
            typ(pg, 'cash', '150000'); pg.wait_for_function("(v) => document.querySelector('[data-pmm] [data-budget]').textContent !== v", arg=shown, timeout=5000)
            e2 = pg.evaluate(ENG + "('new')")
            check(f'{vn} 4 a figure changed: the budget updates, still GW_ENGINE’s', pg.locator('[data-pmm] [data-budget]').inner_text() == money(e2['budget']) and e2['budget'] != e['budget'])
            how = pg.locator('[data-pmm] .pmm-how').text_content()
            check(f'{vn} 4 ... how it is worked out: the rate, the tenure and selling first said', 'Interest rate' in how and 'tenure' in how and 'sold first' in how, how[:300])
            check(f'{vn} 4 ... no sideways scroll', pg.evaluate(NOOVER))
            bud = e2['budget']
            # 5 reload and history
            pg.reload(); pg.wait_for_selector('[data-pmm] [data-budget]')
            check(f'{vn} 5 reload: My Budget again, answers and budget as left', step(pg) == 'budget' and pg.locator('[data-pmm] input[data-k="cash"]').input_value() == '150,000' and pg.locator('[data-pmm] [data-budget]').inner_text() == money(bud))
            nxt(pg); at(pg, 'options')
            pg.go_back(); at(pg, 'budget')
            check(f'{vn} 5 browser Back: My Budget, with its budget', pg.locator('[data-pmm] [data-budget]').inner_text() == money(bud))
            pg.go_forward(); at(pg, 'options')
            check(f'{vn} 5 browser Forward: My Options', pg.locator('[data-pmm] .pmm-t').inner_text() == 'My Options')
            # 6 My Options
            check(f'{vn} 6 selling an HDB flat: the HDB upgrade planner offered too (standalone, no plan marker)', pg.locator('[data-pmm] [data-pmm-hdbup]').get_attribute('href').endswith('tools/hdb-upgrade/'))
            check(f'{vn} 6 Explore says the budget', money(bud) in pg.locator('[data-pmm] [data-explore-sub]').inner_text())
            pg.locator('[data-pmm] [data-add-home]').click(); pg.locator('[data-pmm] [data-hi="0"] [data-hk="name"]').fill('Home A'); pg.locator('[data-pmm] [data-hi="0"] [data-hk="price"]').fill('1,800,000')
            pg.wait_for_selector('[data-pmm] [data-hi="0"] .pmm-mini')
            c = pg.evaluate(ENG + "('new', 1800000)")['cost']; mini = pg.locator('[data-pmm] [data-hi="0"] [data-hr]').inner_text()
            check(f'{vn} 6 a home at $1,800,000: its cash, CPF, loan, monthly and stamp duty are GW_ENGINE’s cost', all(money(c[k]) in mini for k in ['cash', 'cpfUsed', 'loan', 'monthly', 'duty']), [mini, c])
            check(f'{vn} 6 ... within / above the budget said', ('Within your budget' in mini) == (1800000 <= bud) and ('Above your budget' in mini) == (1800000 > bud))
            pg.locator('[data-pmm] [data-add-home]').click(); pg.locator('[data-pmm] [data-hi="1"] [data-hk="price"]').fill('9,000,000'); pg.wait_for_selector('[data-pmm] [data-hi="1"] .pmm-tag.over')
            check(f'{vn} 6 a second home above the budget: said so', 'Above your budget' in pg.locator('[data-pmm] [data-hi="1"]').inner_text())
            check(f'{vn} 6 ... no sideways scroll', pg.evaluate(NOOVER))
            # 7 Budget Search
            pg.locator('[data-pmm] [data-pmm-explore]').click(); pg.wait_for_selector('[data-gw-plan]')
            bar = pg.locator('[data-gw-plan]').inner_text().replace('\n', ' ')
            check(f'{vn} 7 Budget Search: ?plan=v2, "Part of your Plan My Move · Step 3 of 4", Next: My Plan', 'plan=v2' in pg.url and 'Part of your Plan My Move' in bar and 'Step 3 of 4' in bar and 'Next: My Plan' in bar, [pg.url, bar])
            check(f'{vn} 7 ... the budget filled in, from the plan', pg.wait_for_function("(b) => [...document.querySelectorAll('input')].some((i) => i.value.replace(/\\D/g, '') === String(b)) && /From your plan/.test(document.body.innerText)", arg=bud, timeout=8000) is not None)
            check(f'{vn} 7 ... the bar fits', pg.evaluate(NOOVER))
            pg.locator('[data-gw-plan-back]').click(); at(pg, 'options')
            check(f'{vn} 7 Back to my plan: My Options, both homes still there', pg.locator('[data-pmm] [data-hi]').count() == 2 and pg.locator('[data-pmm] [data-hi="0"] [data-hk="name"]').input_value() == 'Home A')
            # 8 My Plan
            check(f'{vn} 8 the last Continue says "See my plan"', 'See my plan' in pg.locator('[data-pmm] [data-next]').inner_text())
            nxt(pg); at(pg, 'plan')
            pl = pg.locator('[data-pmm] [data-plan]').inner_text()
            check(f'{vn} 8 My Plan: the budget, the sale and the homes, as on the other steps', pg.locator('[data-pmm] [data-plan-budget]').inner_text() == money(bud) and money(pg.evaluate(ENG + "('new')")['sale']) in pl and 'Home A' in pl and money(c['cash']) in pl, pl[:400])
            ns = pg.locator('[data-pmm] .pmm-next-l li').all_inner_texts()
            check(f'{vn} 8 ... next steps: 2 to 4, in words (no figures)', 2 <= len(ns) <= 4 and not any(re.search(r'\d', t) for t in ns), ns)
            check(f'{vn} 8 ... Continue gone on the last step; Back there', not pg.locator('[data-pmm] [data-next]').is_visible() and not pg.locator('[data-pmm] [data-back]').is_disabled())
            wa = pg.locator('[data-pmm] [data-pmm-ken]').get_attribute('href')
            check(f'{vn} 8 ... Ken’s link carries no figure', '?' not in wa and '$' not in wa, wa)
            pg.evaluate("window.dispatchEvent(new Event('beforeprint'))"); pg.wait_for_selector('.gw-sheet-host [data-sheet-fig="budget"]', state='attached')
            figs = pg.evaluate("Object.fromEntries([...document.querySelectorAll('.gw-sheet-host [data-sheet-fig]')].map((f) => [f.dataset.sheetFig, f.textContent]))")
            check(f'{vn} 8 Save as PDF: the sheet’s budget, loan and cash are the screen’s', figs.get('budget') == money(bud) and figs.get('loan') == money(e2['top']['loan']) and figs.get('cash') == money(e2['top']['cashNeed']), figs)
            pg.evaluate("window.dispatchEvent(new Event('afterprint'))")
            check(f'{vn} 8 ... no sideways scroll', pg.evaluate(NOOVER))
            pg.locator('[data-pmm] [data-back]').click(); at(pg, 'options')
            check(f'{vn} 8 Back from My Plan: My Options', step(pg) == 'options')
            pg.locator('[data-pmm] .pmm-steps [data-go="situation"]').click(); at(pg, 'situation')
            check(f'{vn} 8 the stepper goes straight to My Situation, answers kept', pg.locator('[data-pmm] input[data-k="hmo"]').input_value() == '1,200' and pg.locator('[data-pmm] [data-k="sit"] [data-v="upgrade"]').get_attribute('aria-checked') == 'true')
            # 10 Start again
            pg.locator('[data-pmm] [data-restart]').click(); at(pg, 'situation')
            check(f'{vn} 10 Start again: back to an empty Step 1', pg.locator('[data-pmm] [aria-checked="true"]').count() <= 2 and pg.locator('[data-pmm] [data-k="sit"] [aria-checked="true"]').count() == 0 and pg.locator('[data-pmm] input[data-k="p0age"]').input_value() == '' and (pg.evaluate(STATE).get('homes') or []) == [])
            pg.close(); ctx.close()

            # 9 keeping a home with CPF; not sure of the type
            ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/', errs); pg.wait_for_selector('[data-pmm] [data-next]')
            chip(pg, 'sit', 'own'); chip(pg, 'n', '1'); typ(pg, 'p0age', '45'); typ(pg, 'p0inc', '15000'); chip(pg, 'htype', 'private'); chip(pg, 'hloan', 'no'); nxt(pg); at(pg, 'budget')
            check(f'{vn} 9 own a home: no sale asked for', not pg.locator('[data-pmm] [data-q="sprice"]').is_visible())
            chip(pg, 'ptype', 'completed'); typ(pg, 'cash', '400000'); typ(pg, 'cpf', '200000')
            pg.wait_for_selector('[data-pmm] [data-q="oa0"]:visible')
            check(f'{vn} 9 keeping a home with CPF: the balances asked for, no budget yet', pg.locator('[data-pmm] [data-budget]').count() == 0)
            nxt(pg); pg.wait_for_selector('[data-pmm] .pmm-needf')
            check(f'{vn} 9 ... Continue: the balances marked', pg.evaluate(NEEDS) == ['oa0', 'sa0'] and step(pg) == 'budget', pg.evaluate(NEEDS))
            typ(pg, 'oa0', '260000'); typ(pg, 'sa0', '150000'); pg.wait_for_selector('[data-pmm] [data-budget]')
            e = pg.evaluate(ENG + "('completed')")
            check(f'{vn} 9 ... with them: the budget, GW_ENGINE’s', e['status'] == 'ok' and pg.locator('[data-pmm] [data-budget]').inner_text() == money(e['budget']), e)
            check(f'{vn} 9 ... ABSD said', 'ABSD' in pg.locator('[data-pmm] .pmm-ans').inner_text())
            pg.locator('[data-pmm] [data-restart]').click(); at(pg, 'situation')
            chip(pg, 'sit', 'first'); chip(pg, 'n', '1'); typ(pg, 'p0age', '32'); typ(pg, 'p0inc', '8000'); nxt(pg); at(pg, 'budget')
            chip(pg, 'ptype', 'unsure'); typ(pg, 'cash', '150000'); typ(pg, 'cpf', '100000'); pg.wait_for_selector('[data-pmm] [data-budget]')
            en, ec = pg.evaluate(ENG + "('new')")['budget'], pg.evaluate(ENG + "('completed')")['budget']
            check(f'{vn} 9 not sure of the type: the lower budget leads, both said', pg.locator('[data-pmm] [data-budget]').inner_text() == money(min(en, ec)) and pg.locator('[data-pmm] [data-both]').count() == 1, [en, ec, pg.locator('[data-pmm] [data-both]').inner_text()])
            check(f'{vn} 9 ... no sideways scroll', pg.evaluate(NOOVER))
            pg.close(); ctx.close()

            # 10 guards and older links
            ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/#plan', errs); pg.wait_for_selector('[data-pmm] [data-next]')
            check(f'{vn} 10 a later step before the earlier ones: My Situation', step(pg) == 'situation' and pg.locator('[data-pmm] .pmm-t').inner_text() == 'My Situation')
            pg.locator('[data-pmm] .pmm-steps [data-go="budget"]').click(); pg.wait_for_timeout(0)
            check(f'{vn} 10 ... the stepper cannot jump ahead either', step(pg) == 'situation')
            pg.close(); ctx.close()
            ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/#up', errs); pg.wait_for_selector('[data-pmm] [data-next]')
            check(f'{vn} 10 an older #up link: Upgrade from an HDB flat already chosen', pg.locator('[data-pmm] [data-k="sit"] [data-v="upgrade"]').get_attribute('aria-checked') == 'true' and pg.locator('[data-pmm] [data-k="htype"] [data-v="hdb"]').get_attribute('aria-checked') == 'true' and step(pg) == 'situation')
            pg.close(); ctx.close(); ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/#sell', errs); pg.wait_for_selector('[data-pmm] [data-next]')
            check(f'{vn} 10 an older #sell link: Step 1 with nothing chosen for the visitor (upgrade or right-size is theirs to say)', step(pg) == 'situation' and pg.locator('[data-pmm] [data-k="sit"] [aria-checked="true"]').count() == 0)
            pg.evaluate("location.hash = 'up'"); pg.wait_for_function("() => location.hash === '#situation' && document.querySelector('[data-pmm] [data-k=\"sit\"] [data-v=\"upgrade\"]').getAttribute('aria-checked') === 'true'", timeout=5000)
            check(f'{vn} 10 the menu’s "Upgrade from HDB" followed on the journey page itself: Upgrade from an HDB flat chosen, still Step 1', pg.locator('[data-pmm] [data-k="htype"] [data-v="hdb"]').get_attribute('aria-checked') == 'true')
            pg.close(); pg = page(ctx, B + '/journey/#own', errs); pg.wait_for_url(re.compile(r'/journey/worth/'), timeout=8000)
            check(f'{vn} 10 an older #own link: Property values', '/journey/worth/' in pg.url)
            pg.close(); ctx.close()

            # 11 standalone calculators
            ctx = br.new_context(**kw); pg = page(ctx, B + '/journey/', errs); pg.wait_for_selector('[data-pmm] [data-next]')
            chip(pg, 'sit', 'first'); chip(pg, 'n', '1'); typ(pg, 'p0age', '33'); typ(pg, 'p0inc', '9100')
            for u, sel in [('/tools/tdsr/', '[data-out]'), ('/tools/hdb-upgrade/', 'main'), ('/tools/what-can-i-buy/', 'main'), ('/tools/payment-planner/', 'main')]:
                pg.goto(B + u); pg.wait_for_selector(sel); pg.wait_for_load_state('load')
                vals = pg.evaluate("[...document.querySelectorAll('input')].filter((e) => e.value && e.type !== 'hidden' && e.type !== 'checkbox' && e.type !== 'radio' && /9100|9,100/.test(e.value)).length")
                check(f'{vn} 11 {u} opened directly: no plan bar, the journey’s answers not used', pg.locator('[data-gw-plan]').count() == 0 and vals == 0 and pg.evaluate(NOOVER))
            check(f'{vn} no script error', not errs, errs[:3])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'pmm-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
