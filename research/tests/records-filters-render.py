# Research Filters (Claude C FINAL, approved 29 Oct 2026) on the real Research page, desktop 1440 and phone 390 (spec section 7 tests 4-8, 10, 14,
# 18-20): counts and disabled options, a size group's link and its range option's lifecycle, Clear filters, the answer line, the phone card,
# keyboard and accessibility.   python3 research/tests/records-filters-render.py
import os, pathlib, re, socket, subprocess, time
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
    pg.goto(B + url); pg.wait_for_selector('#lgTx [data-gwr-count]', timeout=20000); pg.wait_for_timeout(400); return pg, errs
OPTS = "k => [...document.querySelectorAll('#lgTx [data-gwr-f=\"' + k + '\"] option')].map(o => [o.value, o.textContent, o.disabled, o.selected])"
cnt = lambda pg: int(pg.get_attribute('#lgTx [data-gwr-count]', 'data-gwr-count'))
ans = lambda pg: pg.inner_text('#lgTx .gwr-count').replace('\n', ' ')
NOOVER = "() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            # Bartley Ridge 2-bedroom: the group links in the answer-first panel
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/bartley-ridge', "sessionStorage.setItem('kpt.research.bed','2')")
            links = pg.eval_on_selector_all('[data-gwb-matched] [data-gwr-grp]', 'e => e.map(x => [x.dataset.gwrGrp, x.textContent])')
            ok(links == [['2|721|764|12|8', 'See these 8 sales'], ['2|829|850|24|10', 'See these 10 sales']], vn + ': each median tile links to exactly its sales', links)
            pg.click('[data-gwr-grp="2|721|764|12|8"]'); pg.wait_for_timeout(900)
            ok(cnt(pg) == 8 and pg.input_value('#lgTx [data-gwr-f="bin"]') == 'range' and pg.input_value('#lgTx [data-gwr-f="bed"]') == '2' and pg.input_value('#lgTx [data-gwr-f="period"]') == '12' and pg.input_value('#lgTx [data-gwr-f="sale"]') == '3', vn + ': the link lists exactly the group’s 8 sales (2-bedroom, resales, 12 months, ≈ 721–764 sq ft)', cnt(pg))
            bins = pg.evaluate(OPTS, 'bin')
            ok(bins[0][:2] == ['range', '≈ 721–764 sq ft (8)'] and bins[0][3] and [x[1] for x in bins if x[0] in ('700', '800')] == ['700–799 sq ft (8)', '800–899 sq ft (3)'], vn + ': the range option, first and chosen; the bands counted without it', bins)
            ok(-4 <= pg.evaluate("document.getElementById('lgTx').getBoundingClientRect().top") <= 300, vn + ': and the sales come into view')
            sizes = pg.eval_on_selector_all('#lgTx tbody tr .gwr-sz', 'e => e.map(x => parseInt(x.textContent.replace(/[^0-9]/g, "").slice(0, 3)))')
            ok(all(721 <= s <= 764 for s in sizes) and len(sizes) == (5 if vn == 'phone' else 8), vn + ': every row is in the range (a phone starts with 5)', sizes)
            ok(pg.locator('#lgTx [data-gwr-clear]').count() == 1 and 'Individual URA transactions, not a typical price or a valuation.' in pg.inner_text('#lgTx [data-gwr-ansfine]'), vn + ': Clear filters and the fine line show')
            beds = pg.evaluate(OPTS, 'bed')
            ok(all(x[2] for x in beds if x[0] not in ('2', 'all')) and not [x for x in beds if x[0] == '2'][0][2], vn + ': other home types are disabled (0) while the range is kept', beds)
            # persistence: Period kept the range; recount
            pg.select_option('#lgTx [data-gwr-f="period"]', 'all'); pg.wait_for_timeout(300)
            bins = pg.evaluate(OPTS, 'bin')
            ok(bins[0][0] == 'range' and bins[0][3] and cnt(pg) > 8 and bins[0][1] == '≈ 721–764 sq ft (%d)' % cnt(pg), vn + ': changing Period keeps the range and recounts it', bins[0])
            ok(pg.evaluate("document.activeElement && document.activeElement.dataset.gwrF") == 'period', vn + ': keyboard focus stays on the select used')
            # removal: a band removes the range; it does not come back
            pg.select_option('#lgTx [data-gwr-f="bin"]', '700'); pg.wait_for_timeout(300)
            ok(all(x[0] != 'range' for x in pg.evaluate(OPTS, 'bin')) and pg.input_value('#lgTx [data-gwr-f="bin"]') == '700', vn + ': choosing a band removes the range option')
            pg.select_option('#lgTx [data-gwr-f="bed"]', 'all'); pg.wait_for_timeout(300)
            ok(all(x[0] != 'range' for x in pg.evaluate(OPTS, 'bin')), vn + ': and it does not reappear without a link')
            # Clear filters
            pg.click('[data-gwr-grp="2|829|850|24|10"]'); pg.wait_for_timeout(700)
            ok(cnt(pg) == 10 and pg.evaluate(OPTS, 'bin')[0][1] == '≈ 829–850 sq ft (10)', vn + ': another group link replaces the range')
            total = pg.evaluate("GW_REC.filter(document.querySelector('#lgPick').closest('[data-lg=\"project\"]').parentElement.__gwrSt.rec.rows, GW_REC.DEFAULT, 0).length")
            pg.click('#lgTx [data-gwr-clear]'); pg.wait_for_timeout(400)
            ok(cnt(pg) == total and pg.locator('#lgTx [data-gwr-clear]').count() == 0 and all(x[0] != 'range' for x in pg.evaluate(OPTS, 'bin')), vn + ': Clear filters restores every sale and hides itself', [cnt(pg), total])
            ok(pg.evaluate(NOOVER) and not errs, vn + ': no sideways scroll, no script errors', errs[:2]); ctx.close()
            # Parc Clematis 2-bed group: answer line from all 56, unchanged by Show more and the order
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/parc-clematis', "sessionStorage.setItem('kpt.research.bed','2')")
            g = pg.get_attribute('[data-gwr-grp^="2|689|743"]', 'data-gwr-grp') if pg.locator('[data-gwr-grp^="2|689|743"]').count() else None
            if g:
                pg.click('[data-gwr-grp^="2|689|743"]'); pg.wait_for_timeout(800); a1 = ans(pg)
                ok(cnt(pg) == 56 and '$1,359,000 to $1,730,000 · $1,973 to $2,365 psf' in a1, vn + ': Parc Clematis: the answer line is from all 56 sales', a1)
                pg.click('#lgTx [data-gwr-more]'); pg.wait_for_timeout(300); pg.select_option('#lgTx [data-gwr-f="sort"]', 'psfLow'); pg.wait_for_timeout(300)
                ok(ans(pg) == a1, vn + ': unchanged by Show more and the order')
            else: ok(False, vn + ': Parc Clematis 2-bed group link')
            ctx.close()
            # the asking-price "See these sales" still lists exactly its dots' sales (test 18)
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/treasure-at-tampines')
            if pg.locator('#lgAsk').count():
                pg.evaluate("document.getElementById('lgAsk').open = true")
            if pg.locator('[data-gwr-show]').count():
                dots = pg.locator('[data-gwr-show]').first.get_attribute('data-gwr-show')
                pg.evaluate("document.querySelector('[data-gwr-show]').click()"); pg.wait_for_timeout(600)
                ok(pg.input_value('#lgTx [data-gwr-f="period"]') == '12' and all(x[0] != 'range' for x in pg.evaluate(OPTS, 'bin')), vn + ': the asking-price "See these sales" sets its band, sale type and 12 months, no range', dots)
            ctx.close()
            # Type unknown note; phone card lines
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/hundred-palms-residences')
            pg.select_option('#lgTx [data-gwr-f="sale"]', '3'); pg.select_option('#lgTx [data-gwr-f="period"]', '24'); pg.wait_for_timeout(300)
            u = [x for x in pg.evaluate(OPTS, 'bed') if x[0] == 'u']
            ok(u and u[0][1] == 'Type unknown (8)', vn + ': Hundred Palms, resales, 2 years: Type unknown (8)', u)
            pg.select_option('#lgTx [data-gwr-f="bed"]', 'u'); pg.wait_for_timeout(300)
            ok('URA doesn’t record bedrooms. These sales are at sizes Groundwork couldn’t match to one bedroom count, so no home type is shown. They could be any type.' in pg.inner_text('#lgTx [data-gwr-unote]'), vn + ': the Type unknown note')
            ok(pg.evaluate("[...document.querySelectorAll('#lgTx option')].every(o => !o.disabled || !o.selected)"), vn + ': no chosen option is disabled')
            if vn == 'phone':
                pg.select_option('#lgTx [data-gwr-f="bed"]', 'all'); pg.wait_for_timeout(300)
                lines = pg.eval_on_selector_all('#lgTx tbody tr', "e => e.slice(0, 5).map(tr => tr.innerText.split('\\n').map(s => s.trim()).filter(Boolean))")
                ok(lines and all(not any(s.endswith('·') for s in L) for L in lines), vn + ': phone cards: no line ends in "·"', lines[:2])
                ok(all(any(('Type unknown' in s) or re.search(r'\d-bedroom', s) for s in L) for L in lines) and all(any(s.startswith('≈') and 'Floors' in s and re.search(r'Resale|New sale|Sub-sale', s) for s in L) for L in lines), vn + ': each card: the type line, then size · floors · sale', lines[:2])
            ok(pg.evaluate(NOOVER) and not errs, vn + ': no sideways scroll, no script errors', errs[:2]); ctx.close()
            # Kovan Melody: counts and disabled bands with 3-bed chosen (test 2 on the page); accessibility
            ctx = b.new_context(**kw); pg, errs = page(ctx, '/research/#/p/kovan-melody')
            pg.select_option('#lgTx [data-gwr-f="sale"]', '3'); pg.select_option('#lgTx [data-gwr-f="bed"]', '3'); pg.wait_for_timeout(300)
            en = [x[1] for x in pg.evaluate(OPTS, 'bin') if x[0] != 'all' and not x[2]]
            ok(en == ['1,100–1,199 sq ft (3)', '1,200–1,299 sq ft (50)'], vn + ': Kovan Melody 3-bed: two bands enabled', en)
            ok(pg.get_attribute('#lgTx [data-gwr-list]', 'aria-live') == 'polite' and pg.evaluate("document.querySelector('#lgTx [data-gwr-clear]').tagName") == 'BUTTON', vn + ': the list stays aria-live polite; Clear filters is a button')
            pg.select_option('#lgTx [data-gwr-f="sort"]', 'psfHigh'); pg.wait_for_timeout(300)
            first = pg.inner_text('#lgTx tbody tr').replace('\n', ' ')
            ok('Apr 2026' in first and '1,227' in first and '$2,398,000' in first and '$1,954 psf' in first, vn + ': Highest psf first', first)
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
        b.close()
finally:
    srv.terminate()
print('records-filters-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
