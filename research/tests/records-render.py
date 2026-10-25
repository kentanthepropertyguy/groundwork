"""Browser checks for transactions, home-type prices, rents and the Map's price summary (25 Oct 2026), at desktop and 390 px.
Run from the site folder:  python3 research/tests/records-render.py      (RR_SHOTS=<folder> also saves screenshots; RR_REAL_TILES=1 lets map tiles through)
Starts the site's own server and stubs OneMap, so it needs no internet. Waits are for something to appear, never for a fixed time.
"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = pathlib.Path(os.environ['RR_SHOTS']) if os.environ.get('RR_SHOTS') else None
if SHOTS: SHOTS.mkdir(parents=True, exist_ok=True)
REAL = os.environ.get('RR_REAL_TILES') == '1'
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
ok = fail = 0
def check(name, cond, info=''):
    global ok, fail
    if cond: ok += 1; print('  ok   ' + name)
    else: fail += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ld = lambda p: json.load(open(SITE / p))
def shard_of(id_):
    out = subprocess.check_output(['node', '-e', "const P=require(process.argv[1]);process.stdout.write(P.shardName(P.shardOf(process.argv[2],64)))", str(SITE / 'assets/js/kpt-project.js'), id_], text=True); return out
TT = 'treasure-at-tampines'; SH = shard_of(TT)
TXR = ld('data/projects/tx/' + SH + '.json')['projects'][TT]['rows']; BEDR = ld('data/projects/bedroom/' + SH + '.json')['projects'][TT]['resale']['types']
RENTR = ld('data/projects/rent/' + SH + '.json')['projects'][TT]; DET = ld('data/projects/detail/' + SH + '.json')['projects'][TT]
def short(v): return '$' + (('%.2f' % (round(v / 1e4) / 100)).rstrip('0').rstrip('.')) + 'm' if v >= 1e6 else '$' + format(round(v / 1000), ',') + 'k'
def fresh(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    if not REAL: pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
def shot(pg, name, el=None):
    if not SHOTS: return
    pg.add_style_tag(content='.gw-nav{position:static !important}')
    if el: pg.locator(el).first.screenshot(path=str(SHOTS / (name + '.png')))
    else: pg.screenshot(path=str(SHOTS / (name + '.png')))
def count(pg): return int(pg.get_attribute('#lgTx [data-gwr-count]', 'data-gwr-count'))
def flat(pg): return pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')

try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2))]:
            print('\n== 1. What each home type sells for,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/' + TT); pg.wait_for_selector('#lgTypes', timeout=20000)
            rows = pg.eval_on_selector_all('#lgTypes [data-gwr-bed]', 'e => e.map(x => [x.dataset.gwrBed, x.getAttribute("aria-pressed"), x.innerText])')
            check(vn + ': one row per approved type, none chosen for the visitor', [r[0] for r in rows] == [t['g'] for t in BEDR] and all(r[1] == 'false' for r in rows), rows)
            check(vn + ': each row leads with the typical total price, then the middle half, count, sizes and psf', all(short(t['price'][2]) in r[2] and short(t['price'][1]) in r[2] and (str(t['n']) + ' resale') in r[2] and 'psf' in r[2] for t, r in zip(BEDR, rows)), rows[:2])
            check(vn + ': the section comes before the comparison and the price history', pg.evaluate("(() => { const a = document.getElementById('lgTypes'), b = document.getElementById('lgCompare'); return !!(a && b && (a.compareDocumentPosition(b) & 4)); })()"))
            shot(pg, f'01-types-{vn}', '#lgTypes')
            pg.locator('#lgTypes [data-gwr-bed="2"]').scroll_into_view_if_needed(); y0 = pg.evaluate('scrollY')
            pg.click('#lgTypes [data-gwr-bed="2"]'); pg.wait_for_selector('#lgTypes [data-gwr-bed="2"][aria-pressed="true"]')
            t2 = [t for t in BEDR if t['g'] == '2'][0]
            check(vn + ': choosing a type shows its answer at the top of the report', short(t2['price'][2]) in pg.inner_text('[data-gwb-ans]') and pg.locator('#lgPick [data-bed="2"][aria-pressed="true"]').count() == 1)
            check(vn + ': ... and the sales list is filtered to that type', pg.input_value('#lgTx [data-gwr-f="bed"]') == '2' and count(pg) == len([r for r in TXR if r[5] == 2 and r[1] == 3]), (count(pg), pg.input_value('#lgTx [data-gwr-f="bed"]')))
            check(vn + ': the page keeps its place', abs(pg.evaluate('scrollY') - y0) < 300, (y0, pg.evaluate('scrollY')))
            check(vn + ': no sideways scroll, no page errors', flat(pg) and not errs, errs[:2]); ctx.close()

            print('\n== 2. Transaction history,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/' + TT); pg.wait_for_selector('#lgTx [data-gwr-count]', timeout=20000)
            check(vn + ': it starts on the sale type on show (resales), newest first', count(pg) == DET['sale']['resale'] and pg.input_value('#lgTx [data-gwr-f="sale"]') == '3')
            first = pg.inner_text('#lgTx tbody tr:first-child'); newest = max(r[0] for r in TXR if r[1] == 3)
            mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][newest % 100 - 1] + ' ' + str(newest // 100)
            check(vn + ': the first row is the newest month, with total price before psf', mon in first and first.index('$') < first.index('psf'), first)
            check(vn + ': no unit numbers or exact dates anywhere', not re.search(r'#\d{1,2}-\d{1,3}|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d\d', pg.inner_text('#lgTx')))
            pg.select_option('#lgTx [data-gwr-f="sale"]', 'all'); pg.wait_for_function(f"document.querySelector('#lgTx [data-gwr-count]').dataset.gwrCount === '{DET['n']}'")
            check(vn + ': all sale types: every sale Research counts', count(pg) == DET['n'])
            pg.select_option('#lgTx [data-gwr-f="sort"]', 'old'); pg.wait_for_timeout(50)
            oldest = min(r[0] for r in TXR); mon_o = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][oldest % 100 - 1] + ' ' + str(oldest // 100)
            check(vn + ': oldest first', mon_o in pg.inner_text('#lgTx tbody tr:first-child'))
            n0 = pg.locator('#lgTx tbody tr').count(); pg.click('#lgTx [data-gwr-more]'); pg.wait_for_function(f"document.querySelectorAll('#lgTx tbody tr').length > {n0}")
            check(vn + ': "Show more" adds 15 more', pg.locator('#lgTx tbody tr').count() == n0 + 15)
            pg.select_option('#lgTx [data-gwr-f="period"]', '12'); pg.wait_for_timeout(50)
            lo = 202510
            check(vn + ': last 12 months', count(pg) == len([r for r in TXR if r[0] >= lo]))
            shot(pg, f'02-sales-{vn}', '#lgTx')
            check(vn + ': no sideways scroll, no page errors', flat(pg) and not errs, errs[:2]); ctx.close()

            print('\n== 3. Asking price with each sale as a dot,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/' + TT); pg.wait_for_selector('#lgPick', timeout=20000)
            pg.click('[data-lg-ask]'); pg.wait_for_selector('#lgAsk:not([hidden])')
            pg.fill('#lgAsk [data-ask-size]', '678'); pg.fill('#lgAsk [data-ask-price]', '1250000'); pg.wait_for_selector('#lgAsk .gw-ask-v')
            band = [r for r in TXR if r[1] == 3 and r[0] >= 202510 and int(r[3] * 10.7639 // 100 * 100) == 600]
            dots = pg.locator('#lgAsk .gw-ask-svg circle:not([r="7.5"])').count()
            check(vn + ': one dot per sale in the band the check uses', dots == len(band) and ('%d resales' % len(band)) in pg.inner_text('#lgAsk [data-ask-out]'), (dots, len(band)))
            shot(pg, f'03-asking-{vn}', '#lgAsk')
            pg.click('#lgAsk [data-gwr-show]'); pg.wait_for_function(f"document.querySelector('#lgTx [data-gwr-count]').dataset.gwrCount === '{len(band)}'")
            check(vn + ': "See these sales" lists exactly those sales', count(pg) == len(band) and pg.input_value('#lgTx [data-gwr-f="bin"]') == '600' and pg.input_value('#lgTx [data-gwr-f="period"]') == '12')
            check(vn + ': the typed price stays out of the address', '1250000' not in pg.url and '1,250,000' not in pg.url)
            check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

            print('\n== 4. Rents (summaries only) and the asking-rent check,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/' + TT); pg.wait_for_selector('#lgRent', timeout=20000)
            txt = pg.inner_text('#lgRent'); t2r = [t for t in RENTR['types'] if t['beds'] == 2][0]
            check(vn + ': monthly rent first, by bedrooms, with the middle half and the count', ('$' + format(t2r['rent'][2], ',')) in txt and 'a month' in txt and (str(t2r['n']) + ' contracts') in txt)
            check(vn + ': says contracted rents, not asking rents, and gives no yield', 'contracted rents, not asking rents' in txt and 'yield' not in txt.lower())
            check(vn + ': no individual rental contracts are listed', pg.locator('#lgRent table').count() == 0 and 'Recent rental contracts' not in txt and 'Summaries only' in txt)
            check(vn + ': a movement only for one size band with 10+ contracts each year', pg.locator('#lgRent [data-gwrent-move]').count() == len(RENTR.get('moves', [])))
            pg.click('[data-gwrent-ask]'); pg.wait_for_selector('#lgRentAsk:not([hidden])'); pg.select_option('#lgRentAsk [data-ask-beds]', '2')
            band_lo = pg.input_value('#lgRentAsk [data-ask-band]'); pg.fill('#lgRentAsk [data-ask-price]', '3500'); pg.wait_for_selector('#lgRentAsk .gw-ask-v')
            bnd = [x for x in RENTR['bands'] if x['beds'] == 2 and str(x['sqft'][0]) == band_lo][0]
            o = pg.inner_text('#lgRentAsk [data-ask-out]')
            check(vn + ': the asking rent answers first, against that band\'s own summary (no dots: no individual contracts)', re.match(r'(Above|Within|Below) recent rents', o) is not None and (str(bnd['n']) + ' · last 12 months') in o and pg.locator('#lgRentAsk .gw-ask-svg circle:not([r="7.5"])').count() == 0 and bnd['n'] >= 10, o[:120])
            check(vn + ': the size offered first is the most-let one', int(band_lo) == max([x for x in RENTR['bands'] if x['beds'] == 2], key=lambda x: x['n'])['sqft'][0])
            shot(pg, f'04-rents-{vn}', '#lgRent')
            pg.click('#lgTypes [data-gwr-bed="2"]'); pg.wait_for_selector('[data-gwb-ans] [data-gwrent-line]')
            line = pg.inner_text('[data-gwb-ans] [data-gwrent-line]')
            check(vn + ': choosing 2-bedroom shows its typical rent beside its typical price, each with its own count and period', ('$' + format(t2r['rent'][2], ',') + ' a month') in line and (str(t2r['n']) + ' rental contracts') in line and 'Oct 2025' in line and short([t for t in BEDR if t['g'] == '2'][0]['price'][2]) in pg.inner_text('[data-gwb-ans]'), line)
            check(vn + ': ... and its row in Rents is marked', pg.locator('#lgRent [data-gwrent-beds="2"][aria-current="true"]').count() == 1)
            shot(pg, f'04b-answer-rent-{vn}', '[data-gwb-ans]')
            check(vn + ': no sideways scroll, no page errors', flat(pg) and not errs, errs[:2]); ctx.close()
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/the-m'); pg.wait_for_selector('#lgRent', timeout=20000)
            check(vn + ': a bedroom count with too few contracts: rents by size are offered (same band, any bedrooms)', pg.locator('#lgRent [data-gwrent-sizes] [data-gwrent-size]').count() >= 1 and 'whatever their bedrooms' in pg.inner_text('#lgRent'))
            if pg.locator('#lgPick [data-bed="3"]').count():
                pg.click('#lgPick [data-bed="3"]'); pg.wait_for_selector('[data-gwb-ans] [data-gwrent-line]')
                check(vn + ': ... and the chosen type says it has too few, never borrowing another type', 'Too few 3-bedroom rental contracts' in pg.inner_text('[data-gwb-ans] [data-gwrent-line]'))
            check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

            print('\n== 5. No reliable bedroom types: prices by size,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/p/1-canberra'); pg.wait_for_selector('#lgTypes', timeout=20000)
            check(vn + ': "What each size sells for", with no bedroom rows', 'What each size sells for' in pg.inner_text('#lgTypes') and pg.locator('[data-gwr-bed]').count() == 0)
            b0 = pg.get_attribute('#lgTypes [data-gwr-bin]', 'data-gwr-bin'); pg.click('#lgTypes [data-gwr-bin]'); pg.wait_for_selector('#lgTypes [data-gwr-bin][aria-pressed="true"]')
            check(vn + ': choosing a size chooses it for the whole report, and the sales list follows', pg.input_value('#sizeSel') == b0 and pg.input_value('#lgTx [data-gwr-f="bin"]') == b0)
            check(vn + ': no page errors', not errs, errs[:2]); ctx.close()

            print('\n== 6. HDB rents in block research,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/#/hdb/bishan/155/bishan-st-13/5-room'); pg.wait_for_selector('.gw-hr', timeout=20000)
            h = pg.inner_text('.gw-hr')
            check(vn + ': the level is named with its count (block, else street, else town)', re.search(r'\d+ 5-room rentals? (in this block|on Bishan Street 13|in Bishan)', h) is not None, h[:120])
            check(vn + ': typical monthly rent, approval months, declared and unverified', 'Typical monthly rent' in h and 'HDB approvals' in h and 'Declared rents, not verified' in h and 'whole flat' not in h.lower())
            pg.fill('.gw-hr [data-ask-price]', '4500'); pg.wait_for_selector('.gw-hr .gw-ask-v')
            check(vn + ': an asking rent is answered against 10+ rentals', re.match(r'(Above|Within|Below) recent rents', pg.inner_text('.gw-hr [data-ask-out]')) is not None)
            check(vn + ': summaries only: no list of individual rentals', pg.locator('.gw-hr table').count() == 0 and 'Summaries only' in h)
            check(vn + ': rents come after the resale figures and their asking-price check', pg.evaluate("(() => { const a = document.querySelector('[data-hv-out] .gw-apc[data-gw-ask=hdb]'), b = document.querySelector('.gw-hr'); return !!(a && b && (a.compareDocumentPosition(b) & 4)); })()"))
            shot(pg, f'05-hdb-rent-{vn}', '.gw-hr')
            check(vn + ': the resale research is still there above it', pg.locator('[data-hv-out] .gw-vx-res').count() >= 2 and pg.locator('.gw-vx-dots').count() >= 1)
            check(vn + ': no sideways scroll, no page errors', flat(pg) and not errs, errs[:2]); ctx.close()

            print('\n== 7. The Map card leads with total prices,', vn)
            ctx, pg, errs = fresh(br, kw); pg.goto(B + '/research/map/#p=' + TT); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=25000)
            pg.wait_for_selector('[data-lead="beds"]', timeout=15000); L = pg.inner_text('[data-lead="beds"]')
            check(vn + ': bedroom types with typical total prices, psf smaller', '2-bedroom' in L and '$1.15M' in L and 'psf' in L, L[:200])
            if vn == 'desktop': check(vn + ': a muted observed step between types of the same 12 months', '+$590K vs 2-bedroom' in L, L)
            else: check(vn + ': on a phone, one line per type, so the map above the sheet stays framed', pg.locator('[data-lead="beds"] .ldb-1').count() == 3 and '+$' not in L, L)
            check(vn + ': compact: at most 4 types (3 on a phone), the rest in the full research', pg.locator('[data-lead="beds"] .ldb-r').count() == (3 if vn == 'phone' else 4) and 'more type' in L)
            check(vn + ': "View Full Research" opens the report', pg.locator('a[data-m-full]').first.inner_text().strip().startswith('View Full Research'))
            shot(pg, f'06-map-beds-{vn}')
            pg.evaluate("document.querySelector('a[data-m-full]').click()"); pg.wait_for_selector('#lgPick', timeout=20000)
            check(vn + ': ... with Back to Map', '#/p/' + TT in pg.url and 'Back to Map' in pg.inner_text('.lg-back'))
            pg.goto(B + '/research/map/#p=kingsford-waterbay'); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=25000); pg.wait_for_selector('[data-lead="sizes"]', timeout=15000)
            S2 = pg.inner_text('[data-lead="sizes"]')
            check(vn + ': without bedroom types, typical total prices by size', 'sq ft' in S2 and re.search(r'\$\d[\d.]*[KM]', S2) is not None and 'psf' in S2, S2[:160])
            shot(pg, f'07-map-sizes-{vn}')
            check(vn + ': no page errors', not errs, errs[:2]); ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'\nrecords-render: {ok} passed, {fail} failed')
raise SystemExit(1 if fail else 0)
