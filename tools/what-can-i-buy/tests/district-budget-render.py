"""R3c (30 Oct 2026) in a real browser at 360, 390, 1024, 1440 and 1920 px: Budget Search's Where? accepts a postal district ("D19"), with real keystrokes.
The results are the developments recorded in that district (every row D19), with no distance chips and no radius map; the district stays through
filter changes, Back/Forward and the form; "See it on the Map" opens the Map's district view; a radius place (Bishan MRT) works as before; the
Research home's embedded budget search takes it too. Also the R3b fix: a district link reaching Research while gw-nav.js is still loading (forced
here by delaying it) still lists the district, never "No transactions found".
Run from the site folder:  python3 tools/what-can-i-buy/tests/district-budget-render.py
"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[3]
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
def fresh(br, w):
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': 900 if not mob else 844}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
# every development row's district: the table's District cell (desktop) or a card's "D19 ·" line (phone)
ROWD = """[...document.querySelectorAll('.kd-card')].map(c => { const m = c.innerText.match(/\\bD(\\d{1,2})\\b/); return m ? String(m[1]).padStart(2, '0') : null; })"""
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
def pick_district(pg, q='D19'):
    pg.click('#kdPlace'); pg.keyboard.type(q, delay=50); pg.wait_for_selector('.kd-sg[data-t="district"]', timeout=20000)
    pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
def results(pg):
    pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card, .kd-empty, .kd-none', timeout=30000); pg.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [360, 390, 1024, 1440, 1920]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000')
            pg.click('#kdPlace'); pg.keyboard.type('D19', delay=50); pg.wait_for_selector('.kd-sg[data-t="district"]', timeout=20000)
            sg = pg.inner_text('#kdSugg')
            check(f'{vn}: "D19" in Where? offers District 19 (never "No match")', 'District 19' in sg and 'No match' not in sg, sg)
            pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
            check(f'{vn}: chosen with the keyboard; the field says District 19', pg.input_value('#kdPlace') == 'District 19')
            results(pg)
            h, chips, sub = pg.inner_text('#kdH'), pg.inner_text('.kd-chips'), pg.inner_text('.kd-sub')
            check(f'{vn}: results in District 19: chip, line and the Map link', re.match(r'^\d+ developments? match', h) and 'District 19' in chips and 'In District 19 · developments recorded in this postal district' in sub and pg.locator('[data-kd-dmap]').count() == 1, [h, chips, sub])
            ds = pg.evaluate(ROWD)
            check(f'{vn}: every development listed is recorded in D19 ({len(ds)} rows)', ds and all(d == '19' for d in ds), sorted(set(map(str, ds))))
            check(f'{vn}: no centre point or radius: no distance chips, no "within", no radius map', pg.locator('.kd-rad').count() == 0 and 'Within' not in sub and not pg.evaluate("document.body.classList.contains('kd-hasmap')") and ' km' not in pg.inner_text('#kdRes'))
            check(f'{vn}: no sideways scroll', pg.evaluate(NOOVER))
            n1 = h
            # Back to the form and Forward to the results keep the district
            pg.go_back(); pg.wait_for_selector('#kdPlace', timeout=10000); pg.wait_for_timeout(500)
            check(f'{vn}: Back: the form keeps District 19 and the budget', pg.input_value('#kdPlace') == 'District 19' and pg.input_value('#kdBudget') == '2,000,000', [pg.input_value('#kdPlace'), pg.input_value('#kdBudget')])
            check(f'{vn}: Back: the form says "Every development recorded in this postal district", never "Distance from"', 'Every development recorded in this postal district' in pg.inner_text('.kd-place + .kd-sugg ~ .kd-radl, .kd-radl') and 'Distance from' not in pg.inner_text('#kdForm, form, main') and pg.locator('.kd-rad, [data-f=rad]').count() == 0, pg.inner_text('.kd-radl'))
            pg.go_forward(); pg.wait_for_selector('.kd-chips', timeout=20000); pg.wait_for_timeout(800)
            check(f'{vn}: Forward: the same District 19 results', pg.inner_text('#kdH') == n1 and 'District 19' in pg.inner_text('.kd-chips'), pg.inner_text('#kdH'))
            # changing a filter keeps the district
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open', timeout=10000)
            pg.click('#kdEdit [data-f=seg][data-k=type][data-v=condo]'); pg.wait_for_timeout(300)
            pg.wait_for_function("document.querySelector('.kd-chips') && document.querySelector('.kd-chips').innerText.includes('Condo')", timeout=15000); pg.click('#kdEdit [data-f=done] >> visible=true'); pg.wait_for_timeout(600)   # the panel's own "Show N developments" applies and closes it (as the other Budget Search tests do)
            ds2 = pg.evaluate(ROWD)
            check(f'{vn}: changing the property type keeps District 19', 'District 19' in pg.inner_text('.kd-chips') and 'Condo' in pg.inner_text('.kd-chips') and ds2 and all(d == '19' for d in ds2), [pg.inner_text('.kd-chips'), sorted(set(map(str, ds2)))])
            # the Map's district view
            pg.click('[data-kd-dmap]'); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=30000); pg.wait_for_timeout(600)
            check(f'{vn}: "See it on the Map" opens the Map\'s District 19', pg.inner_text('.dp h2, .bs h2') == 'District 19')
            check(f'{vn}: no script errors', not errs, errs[:2]); ctx.close()
        # other districts (each in a fresh tab: the page reopens a tab's saved search); a radius place unchanged
        for q, d in [('D01', '01'), ('district 28', '28'), ('d 9', '09')]:
            ctx, pg, errs = fresh(br, 1440); pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '3,000,000'); pick_district(pg, q); results(pg)
            ds = pg.evaluate(ROWD)
            check(f'"{q}": every row recorded in D{d}', 'District ' + str(int(d)) in pg.inner_text('.kd-chips') and (not ds or all(x == d for x in ds)) and pg.locator('.kd-empty, .kd-none').count() + len(ds) > 0, [pg.inner_text('.kd-chips'), sorted(set(map(str, ds)))]); ctx.close()
        ctx, pg, errs = fresh(br, 1440); pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('#kdPlace'); pg.keyboard.type('bishan mrt', delay=30)
        pg.wait_for_selector('.kd-sg:has-text("Bishan MRT")', timeout=20000); pg.click('.kd-sg:has-text("Bishan MRT")'); results(pg)
        check('a radius place is unchanged: "Bishan MRT · 1 km", distance chips, nearest first', 'Bishan MRT · 1 km' in pg.inner_text('.kd-chips') and pg.locator('.kd-rad').count() >= 1 and 'nearest first' in pg.inner_text('#kdMain, .kd-main')); ctx.close()
        ctx, pg, errs = fresh(br, 1440); pg.goto(B + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('#kdPlace'); pg.keyboard.type('D29', delay=30); pg.wait_for_timeout(1500)
        check('"D29" is not offered as a district', pg.locator('.kd-sg[data-t="district"]').count() == 0)
        check('other cases: no script errors', not errs, errs[:2]); ctx.close()
        # the Research home's embedded budget search
        ctx, pg, errs = fresh(br, 1440)
        pg.goto(B + '/research/#/budget'); pg.wait_for_selector('#kdBudget', timeout=20000); pg.fill('#kdBudget', '2,000,000'); pick_district(pg, 'District 19')
        check('Research home "What can this budget buy?": Where? takes District 19', pg.input_value('#kdPlace') == 'District 19')
        pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card, .kd-empty, .kd-none', timeout=30000); pg.wait_for_timeout(800)
        check('… and its results are District 19', 'District 19' in pg.inner_text('.kd-chips'), pg.url)
        check('embedded: no script errors', not errs, errs[:2]); ctx.close()
        # R3b fix: gw-nav.js arriving late must not turn a district link into "No transactions found"
        bad = 0
        for i in range(8):
            ctx, pg, errs = fresh(br, 390)
            def slow(route):
                time.sleep(0.6); route.continue_()
            pg.route(re.compile(r'gw-nav\.js'), slow)
            pg.goto(B + '/research/#/district/' + ['28', '1', '19', '15'][i % 4])
            try: pg.wait_for_selector('[data-lg-district]', timeout=10000)
            except Exception: bad += 1
            if 'No transactions found' in pg.inner_text('body'): bad += 1
            ctx.close()
        check('R3b fix: with gw-nav.js delayed, a district link always lists the district (8 of 8)', bad == 0, bad)
        br.close()
finally:
    srv.terminate()
print('district-budget-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
