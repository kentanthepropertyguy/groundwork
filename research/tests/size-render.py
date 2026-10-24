import json, os, pathlib, re, socket, subprocess, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sizepick import forget_size
from playwright.sync_api import sync_playwright
"""Size first (25 Oct 2026). Run from the site folder:  python3 research/tests/size-render.py
A development opens with NO size chosen: the question "What size home are you looking at?", one compact drop-down, and a neutral at-a-glance card (counts only).
No size's price, direction or chart appears until a size is picked; then price, Market pulse, chart and explanations follow that size together.
Scenarios (desktop 1440 and phone 390): 1 Canberra 900-999 keeps its supported reading; sizes differ and nothing stands in for the whole development; thin data, none in
12 months and no sales at all say so with three next steps; a size chosen earlier or on the Map is reused; no size shows a helpful start; WhatsApp carries the
development and size; changing the size updates everything; the typed number never leaves the device."""
SITE = pathlib.Path(__file__).resolve().parents[2]
PULSE = json.load(open(SITE / 'data/map/pulse.json'))['rows']
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
def msg(pg, sel):
    h = pg.get_attribute(sel, 'href') or ''
    return urllib.parse.unquote(h.split('text=', 1)[1]) if 'text=' in h else ''
def opts(pg): return pg.eval_on_selector_all('#sizeSel option', 'e => e.map(x => [x.value, x.textContent])')
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        H = kw['viewport']['height']
        ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('request', lambda r: reqs.append(r.url))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap|google-analytics'), lambda r: r.fulfill(status=200, body=''))
        # ---------- 5. no size: a helpful start, no misleading default
        pg.goto(B + '/research/#/p/1-canberra'); forget_size(pg); pg.reload(); pg.wait_for_selector('#sizeSel', state='attached')
        pg.wait_for_timeout(500)
        check(f'{vn}: starts with the question, in plain words', pg.inner_text('#lgPickH') == 'What size home are you looking at?')
        sel = pg.query_selector('#sizeSel'); bb = sel.bounding_box()
        check(f'{vn}: the size selector is on the first screen (bottom at {round(bb["y"] + bb["height"])}px of {H})', bb['y'] + bb['height'] <= H, bb)
        check(f'{vn}: it reads "Choose a size" and nothing is chosen', pg.input_value('#sizeSel') == '' and pg.eval_on_selector('#sizeSel', 'e => e.options[e.selectedIndex].text') == 'Choose a size')
        check(f'{vn}: only one control is shown (a drop-down); the sizes are inside it', pg.locator('#lgPick button[data-bin]').count() == 0 and pg.locator('#lgPick select').count() == 1)
        check(f'{vn}: the exact-size box stays hidden until asked for', not pg.is_visible('#sizeIn') and pg.is_visible('[data-lg-size]') and 'exact size' in pg.inner_text('[data-lg-size]').lower())
        fs = pg.evaluate("parseFloat(getComputedStyle(document.getElementById('sizeSel')).fontSize)")
        check(f'{vn}: the drop-down text is at least 16px (no zoom on a phone) ({fs}px)', fs >= 16)
        check(f'{vn}: no price per sq ft, no direction and no chart for any size before a size is chosen', pg.query_selector('.lg-ans-v') is None and pg.query_selector('[data-mp]') is None and pg.query_selector('svg.lg-chart') is None and pg.query_selector('[data-lg-pickprompt]') is not None)
        hero = pg.inner_text('.lg-hero--ans')
        check(f'{vn}: the hero holds no dollar figure for the development', '$' not in hero.replace('Check an asking price', ''), re.findall(r'\$[\d,]+', hero))
        ov = pg.inner_text('[data-lg-ov]'); o = opts(pg)
        counts = [int(re.search(r'· (\d+) sold', t).group(1)) for v, t in o if v]
        mm = re.search(r'(\d+) resales in the last 12 months', ov)
        check(f'{vn}: the at-a-glance card gives counts only: {mm and mm.group(0)}, across the sizes in the drop-down', mm and int(mm.group(1)) == sum(counts) == PULSE['1-canberra']['a'] and f'Across {len(counts)} sizes' in ov, (ov[:200], counts))
        check(f'{vn}: it says plainly there is no single price for the whole development', 'no single price for the whole development' in ov)
        check(f'{vn}: the drop-down lists each size with how many sold ({len(counts)} sizes)', len(counts) >= 5 and all('sq ft' in t for v, t in o if v), o[:3])
        # ---------- 1 and 2. choose a size: price, pulse, chart and text follow it together
        pg.select_option('#sizeSel', '900'); pg.wait_for_selector('[data-mp]'); pg.wait_for_timeout(300)
        r = PULSE['1-canberra']; mp = pg.inner_text('[data-mp]')
        check(f'{vn}: 1 Canberra 900–999 keeps its supported reading: higher than a year earlier', 'higher than a year earlier' in mp and 'Resale prices for this size' in mp and '900–999 sq ft' in mp, mp[:200])
        check(f'{vn}: ... with the change {r["c"]:g}%, the 34 resales and Sep 2026 from the data', f'{r["c"]:g}%' in mp and str(r['a']) in mp and 'Sep 2026' in mp, mp[:300])
        check(f'{vn}: the price answer names the size: median psf for 900–999 sq ft', '900–999 sq ft' in pg.inner_text('.lg-ans') and '$1,367' in pg.inner_text('.lg-ans'), pg.inner_text('.lg-ans')[:120])
        check(f'{vn}: the selected size is unmistakable (the drop-down shows it, with "the size you chose" and a way to clear it)', '900–999 sq ft' in pg.eval_on_selector('#sizeSel', 'e => e.options[e.selectedIndex].text') and 'the size you chose' in pg.inner_text('#lgPick') and pg.is_visible('#sizeClear') and pg.get_attribute('#sizeSel', 'data-chosen') == 'true')
        nums = pg.inner_text('#numbers')
        check(f'{vn}: the chart section follows the size', '900–999 sq ft' in nums and pg.query_selector('svg.lg-chart') is not None, nums[:160])
        a1 = pg.inner_text('.lg-ans'); m1 = pg.inner_text('[data-mp]')
        pg.select_option('#sizeSel', '1000'); pg.wait_for_timeout(400)
        a2 = pg.inner_text('.lg-ans'); m2 = pg.inner_text('[data-mp]')
        check(f'{vn}: another size changes the price, the reading and the chart text together (and not the development)', a1 != a2 and m1 != m2 and '1,000–1,099 sq ft' in a2 and '1,000–1,099 sq ft' in m2 and '1,000–1,099 sq ft' in pg.inner_text('#numbers') and '1 Canberra' in pg.inner_text('h1'), (a2[:100], m2[:100]))
        check(f'{vn}: no sideways scroll after choosing', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        # ---------- 3. limited data: say so, and give next steps
        pg.select_option('#sizeSel', '1300'); pg.wait_for_timeout(400)
        mp = pg.query_selector('[data-mp]'); t = pg.inner_text('[data-mp]')
        check(f'{vn}: one resale of the size: the block says there is not enough to show a trend, for THAT size', mp.get_attribute('data-mp-sized') == '1' and 'Too few sales of this size to show a trend' in t and 'Only 1 resale of 1,300–1,399 sq ft in the last 12 months' in t and 'reliable price trend' in t, t[:300])
        check(f'{vn}: ... with no direction word and no valuation wording', not re.search(r'higher than|lower than|broadly the same|apprecia|forecast of|bargain', t.replace('Not a valuation or a forecast', ''), re.I), t[:300])
        check(f'{vn}: ... and the figures are this size\'s own', 'This size, last 12 months' in t and 'Latest sale of this size' in t and 'All sizes, last 12 months' in t)
        links = pg.eval_on_selector_all('[data-mp-acts] a', 'e => e.map(x => [x.textContent, x.getAttribute("href")])')
        check(f'{vn}: three next steps: the individual sales on the Map, similar developments, and Ken', len(links) == 3 and 'individual sales' in links[0][0] and links[0][1] == 'map/#p=1-canberra' and 'similar developments' in links[1][0] and 'Ken' in links[2][0], links)
        check(f'{vn}: it says other developments are context, not a price trend for this one', 'context, not a price trend for this one' in t)
        pg.click('[data-mp-similar]'); pg.wait_for_timeout(900)
        check(f'{vn}: "Compare with similar developments" brings the existing comparison suggestions into view', -4 <= pg.evaluate("document.getElementById('lgCompare').getBoundingClientRect().top") <= H * 0.6)
        pg.evaluate('scrollTo(0,0)'); pg.click('[data-mp-next]'); pg.wait_for_timeout(900)
        check(f'{vn}: "Ask Ken about a particular unit" brings the Ask Ken cards into view without opening WhatsApp', -4 <= pg.evaluate("document.getElementById('next').getBoundingClientRect().top") <= H * 0.6 and 'wa.me' not in pg.url)
        check(f'{vn}: the WhatsApp message names the development and that this size had only 1 resale', 'only 1 resale of 1,300–1,399 sq ft in the last 12 months, too few to show a price trend' in msg(pg, '#wa') and 'at 1 Canberra' in msg(pg, '#wa') and 'KPT-PULSE-BUY' in msg(pg, '#wa'), msg(pg, '#wa'))
        pg.evaluate('scrollTo(0,0)')
        pg.select_option('#sizeSel', '1400') if any(v == '1400' for v, _ in opts(pg)) else None
        if pg.input_value('#sizeSel') != '1400':   # a size with older sales only is reached by typing it
            pg.click('[data-lg-size]'); pg.fill('#sizeIn', '1,432'); pg.click('#sizeGo'); pg.wait_for_selector('[data-mp]'); pg.wait_for_timeout(400)
        t = pg.inner_text('[data-mp]')
        check(f'{vn}: a size with none in the last 12 months says so and gives the latest sale of that size', 'No resales of 1,400–1,499 sq ft in the last 12 months' in t and 'The latest was Jun 2025' in t, t[:300])
        check(f'{vn}: the number typed is not in the page address, the WhatsApp text or any request', '1432' not in pg.url and '1,432' not in msg(pg, '#wa') and '1432' not in msg(pg, '#waOwn') and not any('1432' in u or '1%2C432' in u for u in reqs), pg.url)
        pg.click('[data-lg-size]'); pg.fill('#sizeIn', '3,540'); pg.click('#sizeGo'); pg.wait_for_selector('[data-mp-state="nosize"]'); pg.wait_for_timeout(300)
        t = pg.inner_text('[data-mp]'); near = pg.eval_on_selector_all('.mp-near button', 'e => e.map(x => x.getAttribute("data-bin"))')
        check(f'{vn}: a size with no sales at all: "No resales of 3,500–3,599 sq ft recorded here", with the closest sizes', 'No resales of 3,500–3,599 sq ft recorded here' in t and 'no price or trend to show' in t and len(near) >= 1, t[:300])
        check(f'{vn}: ... and the same three next steps', pg.locator('[data-mp-acts] a').count() == 3)
        check(f'{vn}: the price answer does not borrow another size\'s price', '$' not in pg.inner_text('.lg-ans').replace('psf', '') or 'none recorded' in pg.inner_text('.lg-ans'), pg.inner_text('.lg-ans')[:160])
        pg.click('.mp-near button'); pg.wait_for_selector('[data-mp]:not([data-mp-state="nosize"])'); pg.wait_for_timeout(300)
        check(f'{vn}: choosing a closest size updates the page to that size', pg.input_value('#sizeSel') == near[0], (pg.input_value('#sizeSel'), near))
        # ---------- exact size, clear
        pg.click('[data-lg-size]'); pg.fill('#sizeIn', '950'); pg.click('#sizeGo'); pg.wait_for_timeout(500)
        check(f'{vn}: an exact size (950) lands on its 100 sq ft band and the drop-down shows it', pg.input_value('#sizeSel') == '900' and '900–999 sq ft' in pg.inner_text('.lg-ans'))
        pg.click('#sizeClear'); pg.wait_for_selector('[data-lg-ov]'); pg.wait_for_timeout(300)
        check(f'{vn}: Clear size goes back to the neutral start (no price, no pulse), and forgets the size for this tab', pg.query_selector('.lg-ans-v') is None and pg.query_selector('[data-mp]') is None and pg.evaluate("sessionStorage.getItem('kpt.research.size')") is None)
        # ---------- 4. a size chosen earlier is reused (this tab only), including on another development
        pg.select_option('#sizeSel', '1000'); pg.wait_for_selector('[data-mp]')
        pg.goto(B + '/research/#/p/parc-clematis'); pg.wait_for_selector('#sizeSel', state='attached'); pg.reload(); pg.wait_for_selector('#sizeSel', state='attached'); pg.wait_for_timeout(500)
        check(f'{vn}: a size chosen earlier in this tab is reused on the next development (1,000–1,099 sq ft)', pg.input_value('#sizeSel') == '1000' and 'the size you chose' in pg.inner_text('#lgPick') and '1,000–1,099' in pg.inner_text('.lg-ans'), pg.inner_text('#lgPick')[:200])
        check(f'{vn}: it is kept in this tab only (sessionStorage), never in localStorage or the address', pg.evaluate("sessionStorage.getItem('kpt.research.size')") == '1000' and pg.evaluate("localStorage.getItem('kpt.research.size')") is None and 'size' not in pg.url)
        ctx2 = br.new_context(**kw); pg2 = ctx2.new_page(); pg2.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        pg2.goto(B + '/research/#/p/parc-clematis'); pg2.wait_for_selector('#sizeSel', state='attached'); pg2.wait_for_timeout(400)
        check(f'{vn}: a new visitor (new tab) starts with no size', pg2.input_value('#sizeSel') == '' and pg2.query_selector('[data-mp]') is None); ctx2.close()
        # ---------- 7. buyer and homeowner enquiries
        forget_size(pg); pg.goto(B + '/research/#/p/1-canberra'); pg.reload(); pg.wait_for_selector('#wa', state='attached'); pg.wait_for_timeout(400)
        mb, mo = msg(pg, '#wa'), msg(pg, '#waOwn')
        check(f'{vn}: before a size is chosen the buyer message names the development, offers no finding, and keeps its reference', 'considering a property at 1 Canberra' in mb and 'KPT-PULSE-BUY' in mb and 'It shows' not in mb and '/research/#/p/1-canberra' in mb, mb)
        check(f'{vn}: ... and so does the homeowner message', 'own a home at 1 Canberra' in mo and 'KPT-PULSE-SELL' in mo and 'It shows' not in mo, mo)
        pg.select_option('#sizeSel', '900'); pg.wait_for_selector('[data-mp]'); pg.wait_for_timeout(300)
        mb, mo = msg(pg, '#wa'), msg(pg, '#waOwn')
        check(f'{vn}: with a size chosen the buyer message carries the development, the size and the finding', 'considering a property at 1 Canberra' in mb and 'resale prices for 900–999 sq ft higher than a year earlier' in mb and 'KPT-PULSE-BUY' in mb, mb)
        check(f'{vn}: ... and the homeowner message does too', 'own a home at 1 Canberra' in mo and '900–999 sq ft' in mo and 'KPT-PULSE-SELL' in mo, mo)
        check(f'{vn}: neither message holds money, income, CPF or the number typed', not re.search(r'budget|income|cpf|loan|\$', (mb + mo).split('/research/')[0], re.I))
        pg.evaluate("sessionStorage.setItem('kpt.pulse.for','sell')"); pg.reload(); pg.wait_for_selector('[data-mp]'); pg.wait_for_timeout(400)
        check(f'{vn}: an owner who came from Sell still sees the owner\'s card first, with the size kept', pg.evaluate("document.querySelector('[data-lg-for] > *').querySelector('a').id") == 'waOwn' and pg.input_value('#sizeSel') == '900')
        pg.evaluate("sessionStorage.removeItem('kpt.pulse.for')")
        # ---------- Map -> Research
        def to_map(path):
            pg.goto(B + '/research/map/#p=' + path); pg.wait_for_function('window.KPT_MAP_APP && KPT_MAP_APP.evReady', timeout=20000)
            if vn == 'phone': pg.click('.bs-act [data-dpmore]')
            pg.wait_for_selector('a.btn[data-m-full]', timeout=8000)
        forget_size(pg); to_map('parc-clematis')
        pg.click('a.btn[data-m-full]'); pg.wait_for_url('**/research/#/p/parc-clematis**', timeout=10000); pg.wait_for_selector('#sizeSel', state='attached'); pg.wait_for_timeout(400)
        check(f'{vn}: Map -> Open full analysis with no size selected opens the right development with the size question (nothing chosen for the visitor)', 'Parc Clematis' in pg.inner_text('h1') and pg.input_value('#sizeSel') == '' and pg.query_selector('[data-mp]') is None)
        to_map('parc-clematis')
        if pg.get_attribute('details[data-sx=pr]', 'open') is None: pg.click('details[data-sx=pr] > summary'); pg.wait_for_timeout(250)
        band = pg.query_selector('button.band[data-band^="sec:"]')
        if band:
            bn_ = band.get_attribute('data-band').split(':')[1]; band.click(); pg.wait_for_timeout(300)
            pg.click('a.btn[data-m-full]'); pg.wait_for_url('**/research/#/p/parc-clematis**', timeout=10000); pg.wait_for_selector('[data-mp]', timeout=10000); pg.wait_for_timeout(300)
            check(f'{vn}: Map -> a size selected on the Map is reused in the full analysis ({bn_})', pg.input_value('#sizeSel') == bn_ and 'Parc Clematis' in pg.inner_text('h1') and 'the size you chose' in pg.inner_text('#lgPick'), (pg.input_value('#sizeSel'), bn_))
            check(f'{vn}: ... and the Pulse is for that size', f'{int(bn_):,}'.replace(',', ',') in pg.inner_text('[data-mp] .mp-k') or '–' in pg.inner_text('[data-mp] .mp-k'), pg.inner_text('[data-mp] .mp-k'))
            back = pg.query_selector('.lg-back'); check(f'{vn}: the way back to the Map is kept', back is not None and 'Map' in back.inner_text())
        else: check(f'{vn}: the Map offers a size to select', False)
        check(f'{vn}: no script errors', not errs, errs[:2]); ctx.close()
finally: srv.terminate()
print(ok, 'passed', fail, 'failed')
sys.exit(1 if fail else 0)
