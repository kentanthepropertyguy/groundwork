# Research prices UX (Ken, 29 Oct 2026) on the real pages, desktop 1440 and phone 390:
#   python3 research/tests/prices-ux-render.py
# 1. The search preview and the report's "Recent resale prices by home type": every typical and tiered matched type as a row; a row opens the full
#    research on that type (Back returns to the search); no overflow on a phone.
# 2. Price movement is secondary: no movement panel beside the answer unless the reading is reliable; then the answer takes the wider column and
#    the same wording sits in a closed "Sales history & price movement" (a bedroom type and a chosen size alike); a reliable reading keeps its panel.
import os, pathlib, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
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
def page(ctx, url, init=None):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.route('**/*googletagmanager*', lambda r: r.fulfill(status=200, body=''))
    if init: pg.add_init_script('(() => { try { ' + init + ' } catch (e) {} })()')
    pg.goto(B + url); return pg, errs
ROWS = "() => [...document.querySelectorAll('%s .gwr-row2')].map(b => [b.dataset.gwrBed, b.dataset.gwrTier, b.innerText.replace(/\\s+/g, ' ').trim()])"
NOOVER = "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            # 1a. the search preview
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/'); pg.wait_for_selector('#q')
            pg.fill('#q', 'Bartley Ridge'); pg.wait_for_selector('.kpr-results [data-id="bartley-ridge"]'); pg.click('.kpr-results [data-id="bartley-ridge"]'); pg.wait_for_selector('#rwOver [data-ov="dev"]'); pg.wait_for_timeout(500)
            rows = pg.evaluate(ROWS % '#rwOver')
            ok([r[:2] for r in rows] == [['1', 'typical'], ['2', 'median'], ['3', 'median']], vn + ': preview: 1-bedroom typical, 2- and 3-bedroom medians', rows)
            ok('Recent resale prices by home type' in pg.inner_text('#rwOver') and 'last 12 months: the typical' not in pg.inner_text('#rwOver'), vn + ': preview heading, no universal 12 months')
            ok(rows and '$884k' in rows[0][2] and '$1.48m' in rows[1][2] and '$1.63m' in rows[1][2] and '$2.33m to $2.49m' in rows[2][2] and 'Historical matched transactions at other sizes' in rows[2][2], vn + ': preview: the prices, each labelled', rows)
            ok(pg.locator('#rwOver [data-ov="dev"] a[href="#/p/bartley-ridge"], #rwOver [data-ov="dev"] [href*="#/p/bartley-ridge"]').count() >= 1, vn + ': View Full Research is still there')
            ok(pg.evaluate(NOOVER), vn + ': preview: no sideways scroll')
            pg.click('#rwOver .gwr-row2[data-gwr-bed="2"]'); pg.wait_for_selector('[data-gwb-matched]', timeout=20000); pg.wait_for_timeout(400)
            ok('#/p/bartley-ridge' in pg.url and pg.get_attribute('[data-gwb-matched]', 'data-gwb-g') == '2', vn + ': the 2-bedroom row opens the full research on 2-bedroom', pg.url)
            pg.go_back(); pg.wait_for_timeout(800)
            ok('#/p/' not in pg.url, vn + ': Back returns to the search', pg.url)
            ok(not errs, vn + ': preview: no script errors', errs[:2]); ctx.close()
            # Kovan Melody: no typical type, its matched types as rows
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/'); pg.wait_for_selector('#q')
            pg.fill('#q', 'Kovan Melody'); pg.wait_for_selector('.kpr-results [data-id="kovan-melody"]'); pg.click('.kpr-results [data-id="kovan-melody"]'); pg.wait_for_selector('#rwOver [data-ov="dev"]'); pg.wait_for_timeout(500)
            rows = pg.evaluate(ROWS % '#rwOver')
            ok([r[:2] for r in rows] == [['2', 'median'], ['3', 'median'], ['4', 'historical']], vn + ': Kovan Melody preview: 2- and 3-bedroom medians, 4-bedroom historical', rows); ctx.close()
            # 1b. the report's section; a row selects the type
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/bartley-ridge'); pg.wait_for_selector('#lgTypes .gwr-row2'); pg.wait_for_timeout(400)
            ok([r[:2] for r in pg.evaluate(ROWS % '#lgTypes')] == [['1', 'typical'], ['2', 'median'], ['3', 'median']], vn + ': report: the same rows')
            pg.click('#lgTypes .gwr-row2[data-gwr-bed="3"]'); pg.wait_for_selector('[data-gwb-matched][data-gwb-g="3"]', timeout=20000)
            ok(True, vn + ': report: the 3-bedroom row selects 3-bedroom'); ctx.close()
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/kovan-melody'); pg.wait_for_selector('#lgPick'); pg.wait_for_timeout(700)
            ok(pg.locator('#lgTypes .gwr-row2').count() == 3 and pg.locator('#lgSizes').count() == 1 and pg.locator('[id="lgTypes"]').count() == 1, vn + ': Kovan Melody report: its matched types, then the sizes (no duplicate id)'); ctx.close()
            # 2a. a typical type with no reliable trend: no panel, the reason folded, the answer in the wider column
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/bartley-ridge', "sessionStorage.setItem('kpt.research.bed','1')"); pg.wait_for_selector('[data-gwb-ans]'); pg.wait_for_timeout(500)
            ok(pg.locator('[data-gwb-trend], #lgPulse').count() == 0, vn + ': Bartley Ridge 1-bedroom: no price-movement panel')
            ok('$884k' in pg.inner_text('[data-gwb-ans]') and 'Half of the 10 resales sold between $852k and $891k.' in pg.inner_text('[data-gwb-ans]') and 'Rents: typical $3,000 a month' in pg.inner_text('[data-gwb-ans]'), vn + ': the typical price, range and rent are unchanged')
            det = pg.locator('[data-gwb-ans] details[data-gwb-hist]')
            ok(det.count() == 1 and not pg.evaluate("document.querySelector('[data-gwb-ans] details[data-gwb-hist]').open") and 'Not enough matched sales to measure a trend' in pg.text_content('[data-gwb-ans] details[data-gwb-hist]'), vn + ': the reason in a closed "Sales history & price movement"')
            ok(pg.locator('a[href*="tools/"]').count() > 0 and 'What will this home cost me?' in pg.inner_text('body'), vn + ': the financial links stay')
            if vn == 'desktop':
                g = pg.evaluate("(() => { const a = document.querySelector('[data-gwb-ans]').getBoundingClientRect(), h = document.querySelector('.lg-hero h1').getBoundingClientRect(); return [Math.round(a.left), Math.round(a.width), Math.round(h.left)]; })()")
                ok(g[0] > g[2] + 300 and g[1] >= 640, vn + ': the answer takes the wider right column', g)
            ok(pg.evaluate(NOOVER) and not errs, vn + ': no sideways scroll, no script errors', errs[:2]); ctx.close()
            # 2b. a reliable reading keeps its panel
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/hundred-palms-residences', "sessionStorage.setItem('kpt.research.bed','3')"); pg.wait_for_selector('[data-gwb-ans]'); pg.wait_for_timeout(500)
            ok(pg.locator('[data-gwb-trend][data-mp-evidence="strong"]').count() == 1 and pg.locator('[data-gwb-ans] details[data-gwb-hist]').count() == 0 and pg.locator('.gwb-side').count() == 0, vn + ': Hundred Palms 3-bedroom (reliable): the panel stays beside the answer'); ctx.close()
            # 2c. a chosen size without a reliable trend: the same Market Pulse panel, folded
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/bartley-ridge', "sessionStorage.setItem('kpt.research.size','700')"); pg.wait_for_selector('[data-lg-ans]'); pg.wait_for_timeout(600)
            ok(pg.locator('#lgPulse').count() == 0 and pg.locator('[data-lg-ans] details[data-lg-move] [data-mp]').count() == 1 and not pg.evaluate("document.querySelector('details[data-lg-move]').open"), vn + ': 700–799 sq ft (a first look only): Market Pulse folded under the answer, closed')
            ok('A first look' in pg.text_content('details[data-lg-move]') and '$2,023' in pg.inner_text('[data-lg-ans]'), vn + ': its wording unchanged; the psf answer first')
            ok(pg.locator('.lg-jl', has_text='Market Pulse').count() == 0, vn + ': the shortcut row has no Market Pulse link to a folded panel')
            ok(pg.evaluate(NOOVER) and not errs, vn + ': size: no sideways scroll, no script errors', errs[:2]); ctx.close()
        b.close()
finally:
    srv.terminate()
print('prices-ux-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
