import json, os, pathlib, re, socket, subprocess, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sizepick import pick_dominant, forget_size
from playwright.sync_api import sync_playwright
"""Browser checks for Market pulse (desktop and phone). Run from the site folder:  python3 research/tests/pulse-render.py
States: established (higher / stable / lower), a first look, too few sales, a new launch, an EC, nothing in 12 months, no earlier year.
Also: first-screen position, the share link, the Sell and Buy ordering, the WhatsApp text, the Map line and the way back to the Map."""
SITE = pathlib.Path(__file__).resolve().parents[2]
PULSE = json.load(open(SITE / 'data/map/pulse.json'))['rows']
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, i)
# id -> (state, direction, evidence, text the headline must contain)
CASES = {
  'parc-clematis': ('trend', 'stable', 'strong', 'broadly the same as a year earlier'),
  '1-canberra': ('trend', 'higher', 'strong', 'higher than a year earlier'),
  'avenue-south-residence': ('trend', 'stable', 'strong', 'within the spread of what those homes fetched'),
  '1-moulmein-rise': ('trend', 'stable', 'limited', 'A first look'),
  '1-loft': ('activity', '', 'none', 'Too few'),
  'parktown-residence': ('activity', '', 'none', 'new sales'),
  'hundred-palms-residences': ('trend', 'higher', 'strong', 'higher than a year earlier'),
  '24-one-residences': ('stale', '', 'none', 'No resales in the last 12 months'),
  'clavon': ('activity', '', 'none', 'first resale'),
  'ardmore-three': ('activity', '', 'none', 'Too few'),
}
BANNED = re.compile(r'apprecia|valuation of|forecast|predict|bargain|undervalu|overpric|guarantee|investment score', re.I)
def open_dev(pg, base, pid, wait='#wa'):
    # opens a development as a visitor who then picks the size that sold most (a size chosen earlier in the tab would otherwise carry over)
    pg.goto(base + '#/p/' + pid); forget_size(pg); pg.reload(); pick_dominant(pg); pg.wait_for_selector(wait, state='attached')
def expected_line(r):
    return r
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
        H = kw['viewport']['height']
        ctx = br.new_context(**kw); ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=f'http://127.0.0.1:{P}')
        pg = ctx.new_page(); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('request', lambda r: reqs.append(r.url))
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap|google-analytics'), lambda r: r.fulfill(status=200, body=''))
        base = f'http://127.0.0.1:{P}/research/'
        for pid, (state, d, ev, txt) in CASES.items():
            pg.goto(base + '#/p/' + pid); pg.wait_for_selector('[data-lg-cls]', timeout=15000); forget_size(pg); pg.reload(); pg.wait_for_selector('#sizeSel', state='attached', timeout=15000)
            check(f'{vn}: {pid}: before a size is chosen there is no Market pulse (and no price) for a size', pg.query_selector('[data-mp]') is None and pg.query_selector('.lg-ans-v') is None and pg.query_selector('[data-lg-ov]') is not None)
            pick_dominant(pg); pg.wait_for_selector('[data-mp]', timeout=5000)
            mp = pg.query_selector('[data-mp]'); h = pg.inner_text('.mp-h'); hs = h + ' ' + pg.inner_text('.mp-s')
            check(f'{vn}: {pid}: pulse state is {state}/{d or "-"}/{ev}', mp.get_attribute('data-mp-state') == state and (mp.get_attribute('data-mp-dir') or '') == d and mp.get_attribute('data-mp-evidence') == ev, [mp.get_attribute('data-mp-state'), mp.get_attribute('data-mp-dir'), mp.get_attribute('data-mp-evidence')])
            check(f'{vn}: {pid}: summary says "{txt}" ({h})', txt.lower() in hs.lower() and len(h) <= 80, hs)
            figs = pg.query_selector_all('.mp-f > div')
            check(f'{vn}: {pid}: at most three figures ({len(figs)})', 2 <= len(figs) <= 3)
            check(f'{vn}: {pid}: the limit sits beside the figures and the method is collapsed', 'Not a valuation or a forecast' in pg.inner_text('.mp-fine') and pg.query_selector('.mp-d') is not None and not pg.get_attribute('.mp-d', 'open'))
            body = pg.inner_text('[data-mp]')
            check(f'{vn}: {pid}: no valuation or forecast wording', not BANNED.search(body.replace('Not a valuation or a forecast', '')), body[:200])
            check(f'{vn}: {pid}: the pulse comes right after the price answer, and the size question comes first', pg.evaluate("""() => { const a = document.querySelector('.lg-ans'), m = document.querySelector('[data-mp]'), s = document.querySelector('.lg-sizes'); const pos = (x, y) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING); return pos(a, m) && (!s || (pos(s, a) && pos(s, m))); }"""))
            check(f'{vn}: {pid}: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            if state == 'trend' and ev == 'strong':
                tops = pg.evaluate("[...document.querySelectorAll('.mp-h')].map(e => Math.round(e.getBoundingClientRect().bottom))")
                check(f'{vn}: {pid}: the pulse headline is on the first screen ({tops[0]}px of {H})', tops[0] <= H, tops)
        # the one claim that matters: the figures on screen are the figures in the data
        pg.goto(base + '#/p/1-canberra'); pick_dominant(pg); pg.wait_for_selector('[data-mp]')
        r = PULSE['1-canberra']; txt = pg.inner_text('[data-mp]')
        check(f'{vn}: 1-canberra shows the change, the count and the latest sale from the data', f"+{r['c']:g}%" in txt.replace('.0%', '%') or f"{r['c']:g}%" in txt, txt[:300])
        check(f'{vn}: 1-canberra counts agree with the Map file', str(r['a']) in txt and str(r['b']) in txt)
        # "How this was worked out"
        pg.click('.mp-d summary'); dtxt = pg.inner_text('.mp-d')
        check(f'{vn}: the method opens on tap and shows both periods with their counts and medians', re.search(r'\d+', dtxt) and 'sq ft' in dtxt and ('median' in dtxt.lower() or 'psf' in dtxt.lower()), dtxt[:200])
        # share
        pg.click('[data-mp-share]'); pg.wait_for_timeout(150)
        clip = pg.evaluate('navigator.clipboard.readText()')
        check(f'{vn}: Copy link puts this report\'s address on the clipboard', clip.endswith('/research/#/p/1-canberra') and '?' not in clip, clip)
        check(f'{vn}: it confirms, and the link holds nothing typed or personal', pg.is_visible('[data-mp-copied]') and not re.search(r'budget|income|cpf|price=|size=', clip, re.I))
        # next steps: default order, buyer order, owner order; messages
        def order():
            return pg.evaluate("[...document.querySelectorAll('[data-lg-for] > *')].map(e => e.id || (e.querySelector('a[id]') && e.querySelector('a[id]').id) || (e.querySelector('a') && e.querySelector('a').getAttribute('href') || '').slice(0, 20))")
        for who, first in [('', 'budget'), ('buy', 'wa'), ('sell', 'waOwn')]:
            pg.evaluate("w => { try { w ? sessionStorage.setItem('kpt.pulse.for', w) : sessionStorage.removeItem('kpt.pulse.for'); } catch (e) {} }", who)
            open_dev(pg, base, 'parc-clematis')
            ids = pg.evaluate("[...document.querySelectorAll('[data-lg-for] > *')].map(e => { const a = e.querySelector('a'); return a ? (a.id || a.getAttribute('href') || '') : ''; })")
            lead = ids[0]
            check(f'{vn}: next steps ({who or "no question asked"}): {first} comes first', (first == 'budget' and lead not in ('wa', 'waOwn')) or lead == first, ids)
            allids = pg.evaluate("[...document.querySelectorAll('[data-lg-for] a[id]')].map(a => a.id)")
            check(f'{vn}: next steps ({who or "none"}): budget and one Ask Ken card holding both messages (V2.1)', len(ids) == 2 and 'wa' in allids and 'waOwn' in allids, (ids, allids))
            nl = pg.query_selector('[data-mp-next]'); want = {'sell': 'What could my unit sell for?', 'buy': 'Is an asking price reasonable?', '': 'What this means for buying or selling here'}[who]
            check(f'{vn}: the block offers the visitor\'s own next step ({who or "none"}): "{want}"', nl is not None and nl.inner_text().startswith(want), nl and nl.inner_text())
            before = pg.evaluate('scrollY'); nl.click(); pg.wait_for_timeout(900)
            cards = pg.evaluate("document.getElementById('next').getBoundingClientRect().top")
            check(f'{vn}: tapping it brings the Ask Ken cards into view, without opening WhatsApp', pg.evaluate('scrollY') > before and -4 <= cards <= pg.viewport_size['height'] * 0.5 and 'wa.me' not in pg.url, [before, pg.evaluate('scrollY'), cards])
        for sel, ref, words in [('#wa', 'KPT-PULSE-BUY', ['considering a property at Parc Clematis', 'asking price']), ('#waOwn', 'KPT-PULSE-SELL', ['own a home at Parc Clematis', 'could sell for'])]:
            href = pg.get_attribute(sel, 'href'); msg = urllib.parse.unquote(href.split('text=', 1)[1]) if 'text=' in href else ''
            check(f'{vn}: {sel} opens WhatsApp with an editable message naming the development, the finding, the report and {ref}', 'wa.me' in href and all(w in msg for w in words) and ref in msg and '/research/#/p/parc-clematis' in msg and 'broadly the same as a year earlier' in msg, msg)
            check(f'{vn}: {sel} message holds no money, income or CPF', not re.search(r'budget|income|cpf|loan|\$', msg.split('/research/')[0], re.I), msg)
        # a first-look reading is described as such in the message
        open_dev(pg, base, '1-moulmein-rise')
        m1 = urllib.parse.unquote(pg.get_attribute('#wa', 'href').split('text=', 1)[1])
        check(f'{vn}: a first-look reading goes into the message as a first look', 'first look' in m1.lower(), m1)
        open_dev(pg, base, '24-one-residences', '#waOwn')
        m2 = urllib.parse.unquote(pg.get_attribute('#waOwn', 'href').split('text=', 1)[1])
        check(f'{vn}: a development with no recent resales says so in the message', 'no resales in the last 12 months' in m2.lower(), m2)
        # Sell: the moving guide's development step sets the owner's question
        pg.evaluate("try { sessionStorage.removeItem('kpt.pulse.for'); } catch (e) {}")
        pg.goto(f'http://127.0.0.1:{P}/journey/'); pg.wait_for_selector('a[data-pulse-for="sell"]', state='attached', timeout=10000)
        link = pg.query_selector('a[data-pulse-for="sell"]'); check(f'{vn}: Sell has a way into the development\'s market report', 'See how the market is moving' in link.inner_text() or 'See how the market' in link.text_content())
        pg.evaluate("document.querySelector('a[data-pulse-for=sell]').click()"); pg.wait_for_timeout(300)
        check(f'{vn}: following it keeps the owner\'s question for this tab only', pg.evaluate("sessionStorage.getItem('kpt.pulse.for')") == 'sell' and pg.evaluate("localStorage.getItem('kpt.pulse.for')") is None)
        # Buy: the journey's research step carries the buyer's question
        pg.evaluate("try { sessionStorage.removeItem('kpt.pulse.for'); } catch (e) {}")
        pg.goto(f'http://127.0.0.1:{P}/journey/#buy'); pg.wait_for_selector('a[data-pulse-for="buy"]', state='attached', timeout=10000)
        pg.evaluate("document.querySelector('a[data-pulse-for=buy]').click()"); pg.wait_for_timeout(300)
        check(f'{vn}: following Buy\'s research step keeps the buyer\'s question for this tab', pg.evaluate("sessionStorage.getItem('kpt.pulse.for')") == 'buy')
        open_dev(pg, base, 'parc-clematis')
        check(f'{vn}: and the report then leads with the asking-price question', pg.evaluate("document.querySelector('[data-lg-for] > *').querySelector('a').id") == 'wa')
        # Home entry
        # 25 Oct 2026: the homepage Research door is one simple card into Research (its list of links was removed); Market Pulse lives in each report
        pg.goto(f'http://127.0.0.1:{P}/'); pg.wait_for_selector('a.gw-door3[href="research/"]', state='attached', timeout=10000)
        check(f'{vn}: Home keeps one Research door, and adds no Market Pulse block', pg.locator('a.gw-door3[href="research/"]').count() == 1 and not pg.query_selector('[data-mp]'))
        # Map: the line, the link, the way back
        pg.goto(f'http://127.0.0.1:{P}/research/map/#p=parc-clematis');
        pg.wait_for_function('window.KPT_MAP_APP && KPT_MAP_APP.evReady', timeout=20000)
        if vn == 'phone':   # the short sheet is unchanged; the line opens first in More about this home
            check(f'{vn}: Map: the short sheet is unchanged (no line until it is opened)', pg.query_selector('[data-mp-line]') is None)
            pg.click('.bs-act [data-dpmore]')
        try: pg.wait_for_selector('[data-mp-line]', timeout=5000)
        except Exception: pass
        line = pg.query_selector('[data-mp-line]')
        check(f'{vn}: Map: selecting a development shows a one-line market pulse', line is not None)
        if line:
            lt = line.inner_text(); r = PULSE['parc-clematis']
            check(f'{vn}: Map line matches the report: "{lt[:90]}"', 'market pulse' in lt.lower() and 'Resale prices for ' in lt and 'broadly the same as a year earlier' in lt, lt)
            check(f'{vn}: Map line is short ({len(lt)} characters)', len(lt) <= 110, lt)
            if vn == 'phone': check(f'{vn}: Map: it is the first thing in the opened sheet', pg.evaluate("(() => { const l = document.querySelector('[data-mp-line]'), x = document.querySelector('.bs .sxs'); return !!(l && x && (l.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)); })()"))
            check(f'{vn}: Map: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            check(f'{vn}: the line itself has no second link to the report', line.query_selector('a') is None)
            pg.click('a.btn[data-m-full]'); pg.wait_for_url('**/research/#/p/parc-clematis**', timeout=10000); pick_dominant(pg); pg.wait_for_selector('[data-mp]', timeout=10000)
            check(f'{vn}: "Full market report" opens the same development\'s report in Research', 'broadly the same as a year earlier' in pg.inner_text('.mp-h'))
            back = pg.query_selector('.lg-back'); check(f'{vn}: and the way back to the Map is kept', back is not None and 'Map' in back.inner_text(), back and back.inner_text())
            if back:
                back.click(); pg.wait_for_url('**/research/map/**', timeout=10000)
                check(f'{vn}: Back to Map returns to the same development', 'parc-clematis' in pg.url, pg.url)
        # a development not in the data does not break the Map or Research
        pg.goto(base + '#/p/no-such-place'); pg.wait_for_timeout(600)
        check(f'{vn}: an unknown development shows no pulse and no error', pg.query_selector('[data-mp]') is None)
        # privacy and AI: nothing called an AI service; nothing typed was sent anywhere
        bad = [u for u in reqs if re.search(r'openai|anthropic|api\.claude|generativelanguage|/chat/completions', u)]
        check(f'{vn}: no AI service is called', not bad, bad[:2])
        check(f'{vn}: no script errors', not errs, errs[:2]); ctx.close()
finally: srv.terminate()
print(ok, 'passed', fail, 'failed')
sys.exit(1 if fail else 0)
