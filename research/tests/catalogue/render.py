# New Launches catalogue (Claude C r3; r4.1 removal rule + r4.2 Property Type and budget typing) on the real page at 1440, 1280, 1024, 760, 390 and 360 px, the clock fixed at 29 Oct 2026:
# the featured block first and unchanged, the rail (>= 1280) or the Filters sheet, the table or cards, a budget search with the over-budget steps,
# the rendered-text scan, no sideways scroll, "older listing" on 15 Nov, and the missing-data fallback; r4.2: Property Type (79 / 77 / 2), commas while typing.
#   python3 research/tests/catalogue/render.py
import os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[3]
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
B = 'http://localhost:%d' % P
for _ in range(50):
    try:
        socket.create_connection(('127.0.0.1', P), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
ok_n = fail_n = 0
def ok(c, name, info=''):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('  FAIL', name, str(info)[:400])
CLOCK = "(() => { const n = Date.parse('%s'), D = Date; Date.now = () => n; })()"
BAD = re.compile(r'huttons|sold out|sold-out|available now|only \d+ left|\d+ units\b', re.I)
def page(ctx, when='2026-10-29T08:00:00Z', block=None):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text and '404' not in m.text else None)
    pg.route(re.compile(r'googletagmanager|facebook'), lambda r: r.fulfill(status=200, body=''))
    if block: pg.route(re.compile(block), lambda r: r.fulfill(status=404, body='not found'))
    pg.add_init_script(CLOCK % when)
    pg.add_init_script("window.__ev = []; document.addEventListener('DOMContentLoaded', () => { if (window.KPT) { const t = KPT.track; KPT.track = (n, p) => { window.__ev.push([n, p]); try { t(n, p); } catch (e) {} }; } });")
    pg.goto(B + '/research/new-launches/'); pg.wait_for_selector('#listings', state='attached', timeout=20000)
    # r4.2: the classes load after the first draw; wait for them (or, when a file is blocked, for the network to settle)
    if pg.locator('[data-cat-off]').count() == 0:
        if block: pg.wait_for_load_state('networkidle')
        else: pg.wait_for_selector('.gw-cat-rail [data-cat-ptype]:not([hidden])', state='attached', timeout=20000)
    pg.wait_for_timeout(300)
    return pg, errs
NOOVER = "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"
vis = lambda pg, sel: pg.locator(sel).first.is_visible() if pg.locator(sel).count() else False
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w in [1440, 1280, 1024, 760, 390, 360]:
            mob = w <= 760; vn = str(w)
            ctx = b.new_context(viewport={'width': w, 'height': 900 if not mob else 844}, is_mobile=mob, has_touch=mob); pg, errs = page(ctx)
            order = pg.evaluate("[...document.querySelectorAll('main > *')].map(e => e.id || e.className)")
            ok(len(pg.query_selector_all('main a[data-kpt-ms][data-placement="new-launches"]')) == 4 and order.index('listings') > 0, vn + ': the four featured projects first, then Developer listings', order)
            ok(pg.inner_text('#catH') == 'Developer listings' and 'Developer listings · Updated 27 Oct 2026' in pg.inner_text('#listings'), vn + ': heading and "Updated 27 Oct 2026"')
            ok(vis(pg, '.gw-cat-rail') == (w >= 1280) and vis(pg, '[data-cat-open]') == (w < 1280), vn + ': the filter rail at 1280 and wider, a Filters button below')
            ok(vis(pg, '.gw-cat-t') == (not mob) and vis(pg, '.gw-cat-card') == mob, vn + ': a table above 760 px, cards at 760 and below')
            ok(pg.inner_text('[data-cat-n]') == '79 developments', vn + ': all 79 active developments without filters', pg.inner_text('[data-cat-n]'))
            t = pg.inner_text('#listings')
            ok(not BAD.search(t) and t.count('Prices and availability may have changed. Indicative developer listings, not live availability.') == 1, vn + ': rendered text: no provider name, counts, "sold out" or "available now"; one footer line', BAD.search(t))
            ok(pg.locator('[data-cat-slug="arina-east-residences"], [data-cat-slug="altura"], [data-cat-state="none_shown"]').count() == 0 and 'No units' not in t, vn + ': r4: no "no units" or absent developments shown')
            ok(pg.evaluate(NOOVER), vn + ': no sideways scroll')
            # a budget search
            form = '.gw-cat-rail' if w >= 1280 else '.gw-cat-sheet'
            if w < 1280:
                pg.click('[data-cat-open]'); pg.wait_for_timeout(200)
                ok(vis(pg, '[data-cat-sheet]') and pg.evaluate("document.body.classList.contains('gw-cat-lock')"), vn + ': the Filters sheet opens')
            # r4.2: Property Type, after Search and before Maximum budget, once the classes have loaded
            ok(vis(pg, form + ' [data-cat-ptype]') and pg.evaluate("(f => { const a = [...f.querySelectorAll('input[name=q], [data-cat-ptype], input[name=max]')].map(e => e.getBoundingClientRect().top); return a[0] < a[1] && a[1] < a[2]; })(document.querySelector('%s form'))" % form), vn + ': Property Type shows after Search, before Maximum budget')
            ok(pg.inner_text(form + ' [data-cat-ptype]').split('\n')[1:] == ['All Residential', 'Condo & Apartment', 'Executive Condominium (EC)'] and pg.is_checked(form + ' input[name=ptype][value=all]'), vn + ': its three options, All Residential chosen', pg.inner_text(form + ' [data-cat-ptype]'))
            pg.click(form + ' [data-cat-ptype] label:has(input[value=ec])'); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '2 developments' and 'Executive Condominium (EC)' in pg.inner_text('[data-cat-chips]'), vn + ': EC: 2 developments and a chip', pg.inner_text('[data-cat-n]'))
            pg.click(form + ' [data-cat-ptype] label:has(input[value=condo])'); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '77 developments', vn + ': Condo & Apartment: 77', pg.inner_text('[data-cat-n]'))
            pg.click(form + ' [data-cat-ptype] label:has(input[value=all])'); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '79 developments' and pg.inner_text('[data-cat-chips]') == '', vn + ': All Residential: 79, no chip')
            # r4.2: commas while typing (real keystrokes), the caret after the same digit, the value unchanged
            mx = form + ' input[name=max]'
            pg.click(mx); pg.keyboard.type('2000000'); pg.wait_for_timeout(400)
            ok(pg.input_value(mx) == '2,000,000' and pg.evaluate("document.querySelector('%s').selectionStart" % mx) == 9 and pg.inner_text('[data-cat-n]') == '48 developments', vn + ': typing 2000000 shows 2,000,000, caret at the end, 48 developments', [pg.input_value(mx), pg.inner_text('[data-cat-n]')])
            pg.evaluate("document.querySelector('%s').setSelectionRange(2, 2)" % mx); pg.keyboard.type('5'); pg.wait_for_timeout(100)
            c1 = [pg.input_value(mx), pg.evaluate("document.querySelector('%s').selectionStart" % mx)]
            pg.keyboard.press('Backspace'); pg.wait_for_timeout(100)
            c2 = [pg.input_value(mx), pg.evaluate("document.querySelector('%s').selectionStart" % mx)]
            ok(c1 == ['25,000,000', 2] and c2 == ['2,000,000', 1], vn + ': typing 5 after "2," gives 25,000,000 (caret after the 5); Backspace returns 2,000,000 (caret after the 2)', [c1, c2])
            pg.fill(mx, ''); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '79 developments', vn + ': an empty budget means no budget')
            pg.fill(form + ' input[name=max]', '2000000'); pg.check(form + ' input[name=over]'); pg.wait_for_timeout(400)
            if w < 1280:
                ok(pg.inner_text('.gw-cat-show') == 'Show 50 developments', vn + ': the sheet’s button counts the result', pg.inner_text('.gw-cat-show'))
                pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
                ok(not vis(pg, '[data-cat-sheet]') and pg.evaluate("document.activeElement && document.activeElement.hasAttribute('data-cat-open')"), vn + ': Escape closes the sheet and returns focus to Filters')
            ok(pg.inner_text('[data-cat-n]') == '50 developments' and pg.locator('[data-cat-grp="over10"] tr[data-cat-slug]').count() == 2, vn + ': up to $2m with 10%: 50 developments (47 + 1 + 2)', pg.inner_text('[data-cat-n]'))
            pg.click('[data-cat-15]'); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '51 developments' and pg.locator('[data-cat-grp="over15"]').count() == 1, vn + ': "Also show up to 15% over budget" adds its own section (51)')
            ok('Up to $2m' in pg.inner_text('[data-cat-chips]') and vis(pg, '[data-cat-clear]'), vn + ': the summary shows the budget chip and Clear all')
            ok(not BAD.search(pg.inner_text('#listings')) and pg.evaluate(NOOVER), vn + ': budget results: text scan and no sideways scroll')
            # choose EC too, then Clear all resets everything, Property Type included
            if w < 1280: pg.click('[data-cat-open]'); pg.wait_for_timeout(200)
            pg.click(form + ' [data-cat-ptype] label:has(input[value=ec])'); pg.wait_for_timeout(300)
            if w < 1280: pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            ok('Executive Condominium (EC)' in pg.inner_text('[data-cat-chips]'), vn + ': EC combined with the budget: chip shown', pg.inner_text('[data-cat-n]'))
            pg.click('[data-cat-clear]'); pg.wait_for_timeout(300)
            ok(pg.inner_text('[data-cat-n]') == '79 developments' and pg.is_checked(form.replace('.gw-cat-sheet', '.gw-cat-rail') + ' input[name=ptype][value=all]'), vn + ': Clear all restores the full list (79) and All Residential')
            evs = [e for e in pg.evaluate('window.__ev') if e[0] == 'catalogue_filter']
            ok(evs and all(set(e[1].keys()) <= {'filter', 'placement'} for e in evs) and not any(re.search(r'\d{4}', str(e[1])) for e in evs) and any(e[1]['filter'] == 'ptype' for e in evs), vn + ': analytics: one additive event naming the filter only (Property Type as "ptype"), never a budget figure', evs[:3])
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
        # 15 Nov: prices still shown, marked "older listing"
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg, errs = page(ctx, '2026-11-15T05:00:00Z')
        ok('older listing' in pg.text_content('[data-cat-slug="21-anderson"]') and pg.inner_text('[data-cat-n]') == '79 developments', '15 Nov: prices shown, marked "older listing"'); ctx.close()
        # 27 Dec: every development stays, without prices (r4.1: removed only by a complete refresh)
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True); pg, errs = page(ctx, '2026-12-27T06:00:00Z')
        ok(pg.inner_text('[data-cat-n]') == '79 developments' and '$' not in pg.inner_text('[data-cat-res]'), '27 Dec: 79 developments listed, no price anywhere'); ctx.close()
        # r4.2: if the classes cannot load, the Property Type control stays hidden and every development is shown
        for blk in [r'catalogue-classes\.json', r'registry/index\.json']:
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg, errs = page(ctx, block=blk)
            ok(pg.locator('.gw-cat-rail [data-cat-ptype]').count() == 1 and not vis(pg, '.gw-cat-rail [data-cat-ptype]') and pg.inner_text('[data-cat-n]') == '79 developments' and not errs, 'missing ' + blk + ': Property Type hidden, all 79 shown', errs[:2]); ctx.close()
        # missing data: only the featured block and one quiet line
        for blk in [r'launch-roster\.json', r'inventory\.json']:
            ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg, errs = page(ctx, block=blk)
            ok(pg.locator('[data-cat-off]').count() == 1 and pg.inner_text('[data-cat-off]') == 'Developer listings aren’t available right now.' and len(pg.query_selector_all('main a[data-kpt-ms]')) == 4 and not errs, 'missing ' + blk + ': the featured block and one quiet line', errs[:2]); ctx.close()
        # the featured tiles and the catalogue's Lucerne Grand link keep the page's own microsite tracking and attribution
        ctx = b.new_context(viewport={'width': 1440, 'height': 900}); pg, errs = page(ctx)
        pg.route(re.compile(r'lucernegrand\.kentanthepropertyguy\.com'), lambda r: r.fulfill(status=200, body='ok'))
        with ctx.expect_page() as np: pg.click('#listings [data-kpt-ms="lucerne-grand"]')
        newp = np.value; newp.wait_for_load_state()
        ev = [e for e in pg.evaluate('window.__ev') if e[0] == 'microsite_clicked']
        ok(ev and ev[-1][1].get('project_id') == 'lucerne-grand' and 'kpt_from=new-launches' in newp.url, 'the catalogue’s Lucerne Grand link: microsite_clicked and the usual attribution', [ev[-1:], newp.url]); ctx.close()
        b.close()
finally:
    srv.terminate()
print('catalogue-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
