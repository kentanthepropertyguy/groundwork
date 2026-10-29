# Research by bedroom type (V1, 25 Oct 2026): the real page, desktop 1440 and phone 390, on real developments.
#   python3 research/tests/bedroom-first-render.py
# Scenarios: reliable types (floor plans); one type in several sizes; incomplete classification (a type withheld, one too few); a type with too
# few resales; no usable bedroom data; bedrooms <-> sqft; a type kept on another development; Research <-> Map; buyer and owner enquiries;
# the budget line; quantum, psf, counts and the price movement agreeing with the data and the chosen type.
import json, os, pathlib, re, socket, subprocess, sys, time, urllib.parse
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
    else: fail_n += 1; print('  FAIL', name, info)
# the published data, to check the page against
bm = json.loads((SITE / 'data/projects/bedroom/manifest.json').read_text())
sys.path.insert(0, str(SITE))
def rec(dev):
    for f in (SITE / 'data/projects/bedroom').glob('s*.json'):
        d = json.loads(f.read_text())['projects']
        if dev in d: return d[dev]
    return None
import math
def jround(x): return math.floor(x + 0.5)   # JavaScript's Math.round (Python's round() rounds halves to even)
def short(v):
    if v >= 1e6: return '$' + ('%.2f' % (jround(v / 1e4) / 100)).rstrip('0').rstrip('.') + 'm'
    return '$' + format(jround(v / 1000), ',') + 'k'
def typ(dev, g):
    r = rec(dev); return next((t for t in r['resale']['types'] if t['g'] == g), None) if r and r.get('resale') else None

def page(ctx, dev, pre=None):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    if pre is not None: pg.add_init_script('(() => { try { ' + pre + ' } catch (e) {} })()')
    pg.goto(B + '/research/#/p/' + dev); pg.wait_for_selector('#lgPick'); pg.wait_for_timeout(450)
    pg.evaluate("window.__ev=[]; if (window.KPT) { const t = KPT.track; KPT.track = (n, p) => { window.__ev.push([n, p]); try { t(n, p); } catch (e) {} }; }")
    return pg, errs
def click(pg, sel):
    pg.evaluate("s => document.querySelector(s).click()", sel); pg.wait_for_timeout(450)
def text(pg, sel):
    return pg.inner_text(sel) if pg.locator(sel).count() else ''
def overflow(pg): return pg.evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1')
def wa(pg, sel): return urllib.parse.unquote(pg.get_attribute(sel, 'href') or '')

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            # 1. reliable types (layout-verified): nothing chosen at first, a neutral overview, then the 2-bedroom answer, quantum first
            ctx = b.new_context(**kw); dev = 'treasure-at-tampines'; t2 = typ(dev, '2')
            pg, errs = page(ctx, dev)
            ok(text(pg, '#lgPickH') == 'How many bedrooms?', vn + ': types offered where reliable: the question is the bedroom count')
            chips = pg.eval_on_selector_all('[data-bed]', 'e => e.map(x => [x.dataset.bed, x.getAttribute("aria-pressed")])')
            ok([c[0] for c in chips] == [t['g'] for t in sorted(rec(dev)['resale']['types'], key=lambda t: 99 if t['g'] == 'PH' else int(t['g']))] and all(c[1] == 'false' for c in chips), vn + ': one chip per supported type, none chosen', chips)
            ok(pg.locator('[data-gwb-ans]').count() == 0 and pg.locator('[data-lg-ov]').count() == 1 and '$' not in text(pg, '[data-lg-ov]'), vn + ': a neutral overview before a choice, no price')
            ok(pg.locator('#sizeSel').count() == 1 and pg.locator('[data-gwb-area]').is_visible() and pg.locator('#sizeSel').is_hidden(), vn + ': sqft still offered, behind a quiet "Search by floor area" (25 Oct 2026: bedrooms first)')
            click(pg, '[data-bed="2"]')
            a = text(pg, '[data-gwb-ans]')
            ok(short(t2['price'][2]) in a and 'typical price' in a, vn + ': the typical total price, from the data', (a[:120], short(t2['price'][2])))
            ok(('Half of the %d resales' % t2['n']) in a and short(t2['price'][1]) in a and short(t2['price'][3]) in a, vn + ': the middle half and the count')
            ok(('$%s psf' % format(t2['psf'][2], ',')) in a and a.index(short(t2['price'][2])) < a.index('psf'), vn + ': median psf, after the total price')
            bs = pg.evaluate("(() => { const e = document.querySelector('[data-gwb-ans] [data-gwb-how] [data-gwb-basis]'); return e ? e.textContent : ''; })()")   # answer first: in "How these prices are calculated"
            ok('floor plans' in bs and 'rental records' not in bs, vn + ': layout-verified basis said as floor plans (in How these prices are calculated)', bs)
            mp = text(pg, '[data-gwb-trend]'); bandl = '%s–%s sq ft' % (format(t2['trend']['bin'], ','), format(t2['trend']['bin'] + 99, ','))
            ok(bandl in mp and '2-bedroom' in mp, vn + ': price movement names the comparable size of this type', mp[:140])
            ok(pg.locator('[data-mp]').count() == 0, vn + ': no size Market Pulse while a type is shown (one reading, of comparable homes)')
            ev = pg.evaluate('window.__ev')
            sel_ev = [e for e in ev if e[0] == 'research_bedroom_selected']
            ok(sel_ev and sel_ev[0][1].get('bedroom') == '2' and not any(k in sel_ev[0][1] for k in ('price', 'budget', 'size')), vn + ': analytics: the type only', sel_ev)
            m = wa(pg, '#wa'); o = wa(pg, '#waOwn')
            ok('2-bedroom resales at a typical ' + short(t2['price'][2]) in m and 'KPT-PULSE-BUY' in m, vn + ': buyer enquiry carries the type and its typical price', m[:160])
            ok('2-bedroom resales at a typical' in o and 'KPT-PULSE-SELL' in o, vn + ': owner enquiry too')
            run = pg.locator('[data-lg-run-line]')
            ok(run.count() == 1 and run.is_visible() and format(jround(t2['price'][2] / 1000) * 1000, ',') in run.inner_text(), vn + ': Run the numbers at the type’s median price')
            ok(not overflow(pg) and not errs, vn + ': no sideways scroll, no script errors', errs[:2])
            # 2. the size trend from the type; then back to bedrooms
            click(pg, '[data-gwb-size-trend]')
            ok(pg.locator('[data-mp]').count() == 1 and pg.locator('[data-bed][aria-pressed="true"]').count() == 0 and text(pg, '#lgPickH') == 'What size home are you looking at?', vn + ': “See how prices moved by size” opens that size’s Market Pulse; the type is cleared')
            ok(pg.evaluate("sessionStorage.getItem('kpt.research.bed')") is None and pg.evaluate("sessionStorage.getItem('kpt.research.size')") == str(t2['trend']['bin']), vn + ': size kept, type cleared (never both)')
            ok(pg.locator('#bedSwitch').count() == 1, vn + ': a link back to bedrooms beside the chosen size')
            click(pg, '#bedSwitch')
            ok(text(pg, '#lgPickH') == 'How many bedrooms?' and pg.locator('[data-bed][aria-pressed="true"]').count() == 0 and pg.locator('[data-gwb-ans]').count() == 0, vn + ': back to bedrooms, nothing chosen')
            # 3. bedrooms -> sqft through the drop-down, opened from "Search by floor area"
            click(pg, '[data-bed="3"]')
            pg.click('[data-gwb-area]'); pg.wait_for_selector('#gwbArea:not([hidden]) #sizeSel')
            v = pg.evaluate("(()=>{const o=[...document.querySelectorAll('#sizeSel optgroup option')];return o[0]&&o[0].value})()")
            pg.select_option('#sizeSel', v); pg.wait_for_timeout(450)
            ok(pg.locator('[data-gwb-ans]').count() == 0 and pg.locator('.lg-ans').count() == 1 and pg.locator('[data-mp]').count() == 1, vn + ': choosing a size switches to the size answer and its Market Pulse')
            ctx.close()

            # 4. one type in several sizes: the spread is said
            ctx = b.new_context(**kw); pg, errs = page(ctx, 'parc-esta', "sessionStorage.setItem('kpt.research.bed','1')")
            t1 = typ('parc-esta', '1'); a = text(pg, '[data-gwb-ans]')
            ok(pg.locator('[data-bed="1"][aria-pressed="true"]').count() == 1 and 'wide spread' in a and ('%s to %s sq ft' % (format(t1['sqft'][0], ','), format(t1['sqft'][1], ','))) in a, vn + ': several sizes in one type: the range and a plain warning', a[:200])
            bs = pg.evaluate("(() => { const e = document.querySelector('[data-gwb-ans] [data-gwb-how] [data-gwb-basis]'); return e ? e.textContent : ''; })()")
            ok('floor plans' in bs, vn + ': basis said (in How these prices are calculated)', bs)
            # 5. a type kept from the previous development (3-bedroom), shown here because it exists
            click(pg, '[data-bed="3"]'); pg.goto(B + '/research/#/p/jadescape'); pg.wait_for_selector('[data-gwb-ans]'); pg.wait_for_timeout(300)
            ok(pg.locator('[data-bed="3"][aria-pressed="true"]').count() == 1 and short(typ('jadescape', '3')['price'][2]) in text(pg, '[data-gwb-ans]'), vn + ': the type chosen on one development is kept on the next')
            ok(not overflow(pg) and not errs, vn + ': no sideways scroll, no script errors', errs[:2])
            ctx.close()

            # 6. incomplete classification: a type withheld (ambiguous) and one too few to show; a kept type that is missing here
            ctx = b.new_context(**kw); sail = rec('the-sail-at-marina-bay')['resale']
            pg, errs = page(ctx, 'the-sail-at-marina-bay', "sessionStorage.setItem('kpt.research.bed','4')")
            got = pg.eval_on_selector_all('[data-bed]:not([data-gwb-tier])', 'e => e.map(x => x.dataset.bed)')
            ok(got == [t['g'] for t in sail['types']] and '3' not in got, vn + ': only the types the data supports have figure chips (3-bedroom withheld)', got)
            # V2 (27 Oct 2026): the withheld 3-bedroom has enough matched resales, so it is offered as "Matched sales only", never with figures
            mo = pg.eval_on_selector_all('[data-bed][data-gwb-tier="matched"]', 'e => e.map(x => [x.dataset.bed, x.getAttribute("aria-label")])')
            ok(mo == [[m['g'], m['label'] + ', matched sales only'] for m in sail.get('matched', []) if not m['figures']], vn + ': the withheld type is a matched-sales-only chip', mo)
            ok('4-bedroom' in text(pg, '[data-gwb-few]') and '3-bedroom' not in text(pg, '[data-gwb-few]'), vn + ': a type with too few resales is named, without figures')
            ok('No reliable 4-bedroom figures here' in text(pg, '[data-gwb-line]') and pg.locator('[data-bed][aria-pressed="true"]').count() == 0 and pg.locator('[data-gwb-ans]').count() == 0, vn + ': a kept type missing here is said, never swapped for another')
            ok(not errs, vn + ': no script errors', errs[:2])
            ctx.close()

            # 7. no usable bedroom data: the size-first page, unchanged; with a kept type, one plain line
            ctx = b.new_context(**kw); pg, errs = page(ctx, '1-canberra')
            ok(text(pg, '#lgPickH') == 'What size home are you looking at?' and pg.locator('[data-bed]').count() == 0 and pg.locator('[data-gwb-none]').count() == 0, vn + ': no bedroom data: the size question as before')
            pg.close(); pg, errs = page(ctx, '1-canberra', "sessionStorage.setItem('kpt.research.bed','3')")
            ok(pg.locator('[data-gwb-none]').count() == 1 and pg.locator('.lg-ans').count() == 0 and pg.locator('[data-lg-ov]').count() == 1, vn + ': a kept type with no bedroom data here: said, and nothing chosen')
            ok(not errs, vn + ': no script errors', errs[:2])
            ctx.close()

            # 8. the Map passes a size: it wins over a type kept earlier (both can only mean the Map just wrote the size)
            ctx = b.new_context(**kw); pg, errs = page(ctx, 'treasure-at-tampines', "sessionStorage.setItem('kpt.research.bed','2'); sessionStorage.setItem('kpt.research.size','700')")
            ok(pg.locator('.lg-ans').count() == 1 and pg.locator('[data-gwb-ans]').count() == 0 and pg.evaluate("sessionStorage.getItem('kpt.research.bed')") is None, vn + ': a size from the Map wins; the kept type is cleared')
            # Research -> Map
            pg.close(); pg, errs = page(ctx, 'treasure-at-tampines', "sessionStorage.removeItem('kpt.research.size'); sessionStorage.setItem('kpt.research.bed','2')")
            h = pg.get_attribute('[data-gwb-trend] [data-mp-sales]', 'href')
            ok(h == 'map/#p=treasure-at-tampines', vn + ': “See the individual sales on the Map” goes to this development on the Map', h)
            pg.goto(B + '/research/' + h); pg.wait_for_timeout(1500)
            ok('/research/map/' in pg.url, vn + ': the Map opens')
            ctx.close()

            # 9. the budget from What can I afford? on the journey (j:1) only; never in the enquiry
            for j, want in [(1, True), (0, False)]:
                ctx = b.new_context(**kw)
                pg, errs = page(ctx, 'treasure-at-tampines', "sessionStorage.setItem('kpt.research.bed','2'); sessionStorage.setItem('kpt.handoff', JSON.stringify({v:1, from:'planner', state:'ok', budget:{low:1200000, high:1200000, single:true}, j:%d}))" % j)
                bl = text(pg, '[data-gwb-budget]')
                ok((pg.locator('[data-gwb-budget]').count() == 1) == want and (not want or ('$1.2m' in bl and 'approved' in bl)), vn + ': budget line only for a journey budget (j=%d)' % j, bl)
                ok('1.2m' not in wa(pg, '#wa') and '1,200,000' not in wa(pg, '#wa'), vn + ': the budget never goes into the enquiry')
                ctx.close()
        b.close()
finally:
    srv.terminate()
print('bedroom-first-render: %d passed, %d failed' % (ok_n, fail_n))
sys.exit(1 if fail_n else 0)
