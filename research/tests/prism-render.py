"""PRISM V1 (31 Oct 2026) in a real browser at 360, 390, 1024, 1440 and 1920 px.
Research -> PRISM -> Back: Kingsford Waterbay's report shows the PRISM preview, which opens #/prism/kingsford-waterbay (verdict, Why,
Watch out, Reveal figures, benchmark bars and rank, then every layer on the page with each dimension's detail on request, sources); the browser's Back returns to the report with the preview
in view, Forward reopens PRISM; the breadcrumb returns too. Hougang Central's launch page (no resale report is invented) does the same with
its evidence strip. Thomson Three and a development outside the release get no PRISM, and their #/prism/ address falls back to the report.
A direct (shared) link works in a fresh browser. A tampered report or a draft manifest shows no PRISM anywhere. Never: a score, Ken's Take,
sideways scrolling or a script error. The report's own controls still work with the preview in place.
Research arrangement (Ken, 31 Oct 2026): the landing keeps its two choices and one search, explains PRISM Analysis / Property Data and the five
questions (beside the search from 1200 px, aligned with the choice cards); Research's own search leads with PRISM for the two developments
(an overview tab, or the launch card), Thomson Three stays Property Data only, the global search still opens Property Data; the switch moves
between #/prism/ and #/p/; "Calculate my purchase" opens the existing calculator with nothing passed.
Run from the site folder:  python3 research/tests/prism-render.py
"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
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
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': 844 if mob else 900}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    return ctx, pg, errs
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
NEVER = re.compile(r"/\s*100\b|PRISM Score|Ken[’']s Take|1,268")
def in_view(pg, sel):
    return pg.evaluate(f"(() => {{ const r = document.querySelector('{sel}').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }})()")
KW = json.loads((SITE / 'data/prism/v1/reports/kingsford-waterbay.json').read_text())
HC = json.loads((SITE / 'data/prism/v1/reports/hougang-central.json').read_text())
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [360, 390, 1024, 1440, 1920]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            # Kingsford Waterbay: report -> preview -> PRISM
            pg.goto(B + '/research/#/p/kingsford-waterbay'); pg.wait_for_selector('[data-gwp-preview="kingsford-waterbay"]', timeout=30000)
            pv = pg.inner_text('[data-gwp-preview]')
            check(f'{vn}: Kingsford Waterbay report shows the PRISM preview (approved verdict and reveal)', KW['verdict']['headline'] in pv and KW['reveal']['headline'] in pv and 'Open PRISM Analysis' in pv and pg.locator('[data-gwp-preview] .gwp-vl').count() == 1, pv)
            check(f'{vn}: the preview sits after the report\'s opening section, before its section bar', pg.evaluate("(() => { const p = document.querySelector('[data-gwp-preview]'); return p.previousElementSibling && p.previousElementSibling.matches('header.lg-hero') && p.nextElementSibling.matches('nav.lg-jump'); })()"))
            check(f'{vn}: report: no sideways scroll with the preview', pg.evaluate(NOOVER))
            pg.click('[data-gwp-open]'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(300)
            body = pg.inner_text('#app'); first = pg.inner_text('.gwp-card')
            check(f'{vn}: PRISM opens at #/prism/kingsford-waterbay with its title', pg.url.endswith('#/prism/kingsford-waterbay') and pg.title().startswith('PRISM · Kingsford Waterbay'), [pg.url, pg.title()])
            check(f'{vn}: opening = verdict, reveal, Why, Watch out, bars 6.4 vs 4.6 and 5th of 25', all(s in first for s in [KW['verdict']['headline'], KW['reveal']['headline'], 'Why?', 'What should I watch out for?', '6.4', '4.6', '5th', 'of 25', 'Peer median']), first[:400])
            vh = pg.evaluate("document.querySelector('.gwp-vh').getBoundingClientRect().bottom")
            check(f'{vn}: the verdict is on the first screen', vh < pg.viewport_size['height'], vh)
            bars = pg.evaluate("[...document.querySelectorAll('.gwp-bt i')].map(i => i.getBoundingClientRect().width)")
            check(f'{vn}: same-scale bars: 6.4 longer than 4.6 in proportion', len(bars) == 2 and abs(bars[1] / bars[0] - 4.6 / 6.4) < 0.03, bars)
            check(f'{vn}: the official mark and the shared hero load', pg.evaluate("[...document.querySelectorAll('.gwp-mark, .gwp-hero')].every(i => i.complete && i.naturalWidth > 0)"))
            check(f'{vn}: never a score, Ken\'s Take or a withheld supply figure', not NEVER.search(body), NEVER.search(body))
            full = pg.inner_text('[data-gwp-page]').lower()
            check(f'{vn}: every layer on the page: hidden connections, supporting context, next buyer question, the five dimensions (with Ken\'s questions), sources', all(x.lower() in full for x in ['Hidden connections', 'Supporting context', KW['nextBuyerQuestion']['text'], 'The five PRISM dimensions', 'Price Position', 'Resale Potential', 'Infrastructure & Catalysts', 'Supply Pressure', 'Market Demand', 'Sources, data periods and limits'] + (['Am I paying a reasonable price compared with relevant alternatives?'] if w >= 720 else [])), full[:300])   # phones: rows show name and headline only (approved mobile layout)
            hc2 = next(h for h in KW['hiddenConnections'] if h['id'] == 'HC2')['text']; hc1 = next(h for h in KW['hiddenConnections'] if h['id'] == 'HC1')['text']
            check(f'{vn}: the cross-dataset finding is a Hidden connection; the single-dataset one is Supporting context (wording unchanged)', hc2 in pg.inner_text('[data-gwp-hidden]') and hc1 in pg.inner_text('[data-gwp-context]') and hc1 not in pg.inner_text('[data-gwp-hidden]'))
            check(f'{vn}: no internal status wording on the page', not re.search(r'approved|in this release|withheld|not published|score100|pulse-v1', pg.inner_text('.gwp-card') + pg.inner_text('.gwp-two') + pg.inner_text('.gwp-dims'), re.I))
            hl = pg.evaluate("[...document.querySelectorAll('[data-gwp-headline] b')].map(b => b.innerText)")
            check(f'{vn}: first visit: all five dimensions closed, each with its headline finding (not a count)', pg.locator('.gwp-dimp:not([hidden])').count() == 0 and len(hl) == 5 and hl[0] == 'Not assessed in this report' and hl[1].startswith('5th of 25 comparable developments') and '15,058 private homes within 2 km' in hl[3] and hl[4].startswith('+2.3% same-size resale prices') and not any(re.search(r'\d+ measures?$', x) for x in hl), hl)
            pg.click('[data-gwp-toggle="R"]'); pg.click('[data-gwp-toggle="S"]'); pg.wait_for_timeout(200)
            rp = pg.evaluate("(() => { const b = document.querySelector('[data-gwp-toggle=R]').getBoundingClientRect(), p = document.getElementById('gwpDimR').getBoundingClientRect(), i = document.querySelector('[data-gwp-toggle=I]').getBoundingClientRect(); return [Math.round(p.top - b.bottom), p.bottom <= i.top]; })()")
            check(f'{vn}: Resale opens directly beneath its own row; Supply stays open beside it (independent)', pg.locator('#gwpDimR').is_visible() and pg.locator('#gwpDimS').is_visible() and pg.get_attribute('[data-gwp-toggle="R"]', 'aria-expanded') == 'true' and 0 <= rp[0] <= 2 and rp[1], rp)
            check(f'{vn}: opened, Resale shows ALL its approved measures', pg.locator('#gwpDimR [data-gwp-metric]').count() == 5)
            pg.click('[data-gwp-toggle="R"]'); pg.wait_for_timeout(150)
            check(f'{vn}: closing Resale leaves Supply open', pg.locator('#gwpDimR').is_hidden() and pg.locator('#gwpDimS').is_visible())
            pg.click('[data-gwp-all="open"]'); pg.wait_for_timeout(150)
            check(f'{vn}: Expand all opens all five', pg.locator('.gwp-dimp:not([hidden])').count() == 5)
            pg.click('[data-gwp-all="close"]'); pg.wait_for_timeout(150)
            check(f'{vn}: Collapse all closes all five', pg.locator('.gwp-dimp:not([hidden])').count() == 0)
            pg.focus('[data-gwp-toggle="I"]'); pg.keyboard.press('Enter'); pg.wait_for_timeout(120); k1 = pg.locator('#gwpDimI').is_visible(); pg.keyboard.press('Space'); pg.wait_for_timeout(120)
            check(f'{vn}: keyboard: Enter opens a dimension, Space closes it; its row is a real button with aria-expanded', k1 and pg.locator('#gwpDimI').is_hidden() and pg.get_attribute('[data-gwp-toggle="I"]', 'aria-expanded') == 'false')
            hb = pg.evaluate("(() => { const h = document.querySelector('.gwp-h1').getBoundingClientRect(), t = document.querySelector('.gwp-head [data-gwp-switch]').getBoundingClientRect(); return [Math.round(t.top - h.bottom), Math.round(t.left - h.left)]; })()")
            check(f'{vn}: PRISM view: the tabs sit directly under the name', 0 <= hb[0] <= 120 and abs(hb[1]) <= 2, hb)
            g = pg.evaluate("(() => { const c = document.querySelector('.gwp-card').getBoundingClientRect(), h = document.querySelector('.gw-nav-in, .gw-nav .gw-wrap, .gw-nav > div'); const hr = h ? h.getBoundingClientRect() : null; return { cw: c.width, cl: c.left, hl: hr && hr.left, iw: innerWidth }; })()")
            check(f'{vn}: the PRISM page uses the site\'s content width (no narrow preview column)', g['cw'] >= g['iw'] - 2 * g['cl'] - 2 and (w < 1500 or g['cw'] >= 1300), g)
            pg.click('[data-gwp-toggle="S"]'); pg.click('[data-gwp-toggle="P"]'); pg.click('[data-gwp-sources] > summary'); pg.wait_for_timeout(200)
            sp = pg.inner_text('[data-gwp-pillar="S"]')
            check(f'{vn}: Supply Pressure: S3/S4 shown as not assessed in this report, never a value', 'Not assessed in this report' in sp and 'Launched but unsold homes' in sp and pg.locator('[data-gwp-metric="S.pipeline2km"], [data-gwp-metric="S.launchedUnsold2km"]').count() == 0, sp)
            check(f'{vn}: Price Position (no measure): "Not assessed in this report", pointing to prices by size; no placeholder', 'Not assessed in this report' in pg.inner_text('#gwp-P') and pg.locator('#gwp-P [data-gwp-evidence="lgTypes"]').count() == 1 and pg.locator('#gwp-P [data-gwp-metric]').count() == 0 and not re.search(r'\[(approved measure|value)', pg.inner_text('[data-gwp-page]'), re.I))
            # the section bar: held under the site header while scrolling; jumps to a dimension below it; never covers more than a line
            pg.evaluate('scrollTo(0, 1600)'); pg.wait_for_timeout(300)
            sb = pg.evaluate("(() => { const b = document.querySelector('[data-gwp-bar]').getBoundingClientRect(), n = document.querySelector('.gw-nav').getBoundingClientRect(); return [Math.round(b.top - n.bottom), Math.round(b.height)]; })()")
            check(f'{vn}: the section bar stays pinned under the site header, one compact line', abs(sb[0]) <= 2 and sb[1] <= (56 if w >= 720 else 50), sb)
            pg.click('[data-gwp-all="close"]'); pg.click('[data-gwp-bar] [data-gwp-jump="I"]'); pg.wait_for_timeout(500)
            jt = pg.evaluate("(() => { const s = document.querySelector('#gwp-I').getBoundingClientRect(), b = document.querySelector('[data-gwp-bar]').getBoundingClientRect(); return [Math.round(s.top - b.bottom), document.querySelector('[data-gwp-bar] [aria-current]').dataset.gwpJump]; })()")
            check(f'{vn}: the "Infrastructure" chip opens that dimension and moves to it, just below the bar, marked current', 0 <= jt[0] <= 40 and jt[1] == 'I' and pg.locator('#gwpDimI').is_visible(), jt)
            check(f'{vn}: the address does not change when jumping within the page', pg.url.endswith('#/prism/kingsford-waterbay'))
            if w < 720: check(f'{vn}: phone bar: Price (nothing assessed) left out to keep it short', pg.locator('[data-gwp-bar] [data-gwp-jump="P"]').is_hidden())
            check(f'{vn}: sources keep licences, attribution and the evidence limits', pg.locator('[data-gwp-sources] a[href="https://data.gov.sg/open-data-licence"]').count() >= 1 and 'Not endorsed by URA' in pg.inner_text('[data-gwp-sources]') and 'Rental contracts include renewals' in pg.inner_text('[data-gwp-sources]'))
            check(f'{vn}: PRISM page: no sideways scroll (full analysis open)', pg.evaluate(NOOVER))
            # Back -> the report with the preview in view; Forward -> PRISM
            pg.go_back(); pg.wait_for_selector('[data-gwp-preview="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(500)
            check(f'{vn}: Back returns to the Kingsford Waterbay report, the preview in view', pg.url.endswith('#/p/kingsford-waterbay') and in_view(pg, '[data-gwp-preview]'), pg.url)
            pg.go_forward(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: Forward reopens PRISM', pg.url.endswith('#/prism/kingsford-waterbay'))
            pg.click('.gwp-nx[data-gwp-back]'); pg.wait_for_selector('header.lg-hero', timeout=20000); pg.wait_for_timeout(400)
            check(f'{vn}: "Property Data" (where next) returns to the report', pg.url.endswith('#/p/kingsford-waterbay'), pg.url)
            hb = pg.evaluate("(() => { const h = document.querySelector('header.lg-hero h1').getBoundingClientRect(), t = document.querySelector('header.lg-hero [data-gwp-switch]').getBoundingClientRect(); return [Math.round(t.top - h.bottom), Math.round(t.left - h.left)]; })()")
            check(f'{vn}: Property Data view: the same tabs directly under the name', 0 <= hb[0] <= 60 and abs(hb[1]) <= 2 and pg.get_attribute('header.lg-hero [data-gwp-view="data"]', 'aria-current') == 'page', hb)
            bl = pg.evaluate("[...document.querySelectorAll('[data-gwp-back2]')].map(a => a.closest('section').id + '>' + a.dataset.gwpBack2).sort()")
            check(f'{vn}: Property Data sections link back to the dimension that reads them (sales and rents: Resale; price moves: Demand; location: Infrastructure; none to unassessed Price)', bl == sorted(['lgTx>R', 'lgRent>R', 'numbers>M', 'lgLoc>I']), bl)
            pg.click('#lgRent [data-gwp-back2]'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(600)
            rt = pg.evaluate("(() => { const s = document.querySelector('#gwp-R').getBoundingClientRect(), b = document.querySelector('[data-gwp-bar]').getBoundingClientRect(); return Math.round(s.top - b.bottom); })()")
            check(f'{vn}: "PRISM · Resale Potential" on Rents opens PRISM at Resale Potential, opened (#/prism/…/r)', pg.url.endswith('#/prism/kingsford-waterbay/r') and -2 <= rt <= 60 and pg.locator('#gwpDimR').is_visible(), [rt, pg.url])
            pg.click('#gwpDimR [data-gwp-evidence="lgTx"] >> nth=0'); pg.wait_for_selector('#lgTx', timeout=20000); pg.wait_for_timeout(700)
            check(f'{vn}: "Evidence: Sales history" opens Property Data at its sales history', pg.url.endswith('#/p/kingsford-waterbay') and in_view(pg, '#lgTx .gwr-head'), pg.url)
            pg.go_back(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: … and Back returns to PRISM with Resale still open', '#/prism/kingsford-waterbay' in pg.url and pg.wait_for_selector('#gwpDimR:not([hidden])', timeout=5000) is not None)
            pg.go_back(); pg.wait_for_selector('header.lg-hero', timeout=20000)
            # the report's own controls still work with the preview in place (a redraw keeps exactly one preview)
            if pg.locator('#sizeSel').count():
                opt = pg.evaluate("(() => { const s = document.getElementById('sizeSel'); const o = [...s.options].find(o => o.value); return o ? o.value : null; })()")
                if opt: pg.select_option('#sizeSel', opt); pg.wait_for_timeout(700)
                check(f'{vn}: choosing a size redraws the report and keeps one PRISM preview', pg.locator('[data-gwp-preview]').count() == 1 and pg.url.endswith('#/p/kingsford-waterbay'))
            check(f'{vn}: Kingsford Waterbay: no script errors', not errs, errs[:2]); ctx.close()
            # Hougang Central: its launch page (no resale report invented) -> preview -> PRISM -> Back
            ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/#/p/hougang-central'); pg.wait_for_selector('[data-gwp-preview="hougang-central"]', timeout=30000)
            page = pg.inner_text('#app')
            check(f'{vn}: Hougang Central: its launch page as before (own site, no resale analysis) plus the PRISM preview', 'Open its site' in page and 'no resale transactions to analyse yet' in page and HC['verdict']['headline'] in pg.inner_text('[data-gwp-preview]'), page[:300])
            pg.click('[data-gwp-open]'); pg.wait_for_selector('[data-gwp-page="hougang-central"]', timeout=20000)
            first = pg.inner_text('.gwp-card')
            check(f'{vn}: Hougang Central opening: mixed verdict, 72,532 and 1,149, flats not buyers', all(s in first for s in [HC['verdict']['headline'], '72,532', '1,149', 'Includes 1,104 rental flats', 'A count of flats, not of buyers or upgraders.']), first[:400])
            check(f'{vn}: Hougang Central: no district made up, no score or Ken\'s Take', 'District' not in pg.inner_text('.gwp-meta') and not NEVER.search(pg.inner_text('#app')))
            check(f'{vn}: Hougang Central PRISM: no sideways scroll', pg.evaluate(NOOVER))
            pg.go_back(); pg.wait_for_selector('[data-gwp-preview="hougang-central"]', timeout=20000); pg.wait_for_timeout(300)
            check(f'{vn}: Back returns to the Hougang Central page', pg.url.endswith('#/p/hougang-central') and 'Open its site' in pg.inner_text('#app'))
            check(f'{vn}: Hougang Central: no script errors', not errs, errs[:2]); ctx.close()
        # Thomson Three and a development outside the release: no PRISM at all; their #/prism/ address falls back to the report
        for w in [390, 1440]:
            for dev in ['thomson-three', 'jadescape']:
                ctx, pg, errs = fresh(br, w)
                pg.goto(B + '/research/#/p/' + dev); pg.wait_for_selector('header.lg-hero', timeout=30000); pg.wait_for_timeout(2500)
                check(f'{w}px {dev}: report unchanged, no PRISM preview', pg.locator('[data-gwp-preview]').count() == 0 and 'PRISM' not in pg.inner_text('#app'))
                pg.goto(B + '/research/#/prism/' + dev); pg.wait_for_function(f"location.hash === '#/p/{dev}'", timeout=20000); pg.wait_for_selector('header.lg-hero', timeout=30000); pg.wait_for_timeout(1500)
                check(f'{w}px {dev}: #/prism/{dev} falls back to its report, no empty PRISM page', pg.locator('[data-gwp-page]').count() == 0 and 'PRISM' not in pg.inner_text('#app'))
                check(f'{w}px {dev}: no script errors', not errs, errs[:2]); ctx.close()
        # a shared link in a fresh browser
        ctx, pg, errs = fresh(br, 390)
        pg.goto(B + '/research/#/prism/hougang-central'); pg.wait_for_selector('[data-gwp-page="hougang-central"]', timeout=30000)
        check('a shared PRISM link opens directly; its Property Data tab leads to the development\'s Research page', pg.get_attribute('[data-gwp-switch] [data-gwp-view="data"]', 'href') == '#/p/hougang-central' and pg.get_attribute('.gwp-crumb a', 'href') == '#/')
        check('Hougang Central (a launch): its actions are "Open its site" and "Calculate my purchase", no Compare', pg.locator('.gwp-acts [data-gwp-site]').count() == 1 and pg.locator('.gwp-acts [data-gwp-compare]').count() == 0 and pg.locator('.gwp-acts [data-gwp-calc]').count() == 1)
        pg.click('[data-gwp-switch] [data-gwp-view="data"]'); pg.wait_for_selector('[data-gwp-preview="hougang-central"]', timeout=20000)
        check('… and following it from a shared link lands on the Hougang Central page', pg.url.endswith('#/p/hougang-central'))
        check('shared link: no script errors', not errs, errs[:2]); ctx.close()
        # fail closed: a tampered report, a draft manifest
        def tampered(route):
            r = route.fetch(); route.fulfill(response=r, body=r.text().replace('Regular project-wide resale activity', 'Excellent investment'))
        def draft(route):
            r = route.fetch(); route.fulfill(response=r, body=r.text().replace('"status": "approved"', '"status": "draft"', 1))
        for name, pat, fn in [('a tampered report', r'reports/kingsford-waterbay\.json', tampered), ('a draft manifest', r'prism/v1/manifest\.json', draft)]:
            ctx, pg, errs = fresh(br, 1440); pg.route(re.compile(pat), fn)
            pg.goto(B + '/research/#/p/kingsford-waterbay'); pg.wait_for_selector('header.lg-hero', timeout=30000); pg.wait_for_timeout(2500)
            check(f'{name}: no PRISM preview on the report', pg.locator('[data-gwp-preview]').count() == 0 and 'Excellent investment' not in pg.inner_text('#app'))
            pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_function("location.hash === '#/p/kingsford-waterbay'", timeout=20000)
            check(f'{name}: the PRISM address falls back to the report', pg.locator('[data-gwp-page]').count() == 0)
            ctx.close()
        # ---- Research arrangement (Ken, 31 Oct 2026): two choices and one search kept; PRISM Analysis | Property Data inside "Research a property"
        for w in [360, 390, 1024, 1440, 1920]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/'); pg.wait_for_selector('[data-gwp-land]', timeout=30000)
            check(f'{vn}: landing keeps its two choices and its one search', pg.locator('#opt-dev').count() == 1 and pg.locator('#opt-budget').count() == 1 and pg.locator('#q').count() == 1 and pg.locator('[data-gwp-land] input').count() == 0)
            land = pg.inner_text('[data-gwp-land]')
            check(f'{vn}: landing explains PRISM and the five questions, with nothing to click in it', all(s in land for s in ['The bigger picture behind the numbers.', 'Five questions every property buyer should consider', 'Price Position', 'Resale Potential', 'Infrastructure & Catalysts', 'Supply Pressure', 'Market Demand', 'Am I paying a reasonable price compared with relevant alternatives?']) and pg.locator('[data-gwp-land] a, [data-gwp-land] button').count() == 0, land[:300])
            pg.wait_for_selector('[data-gwp-picks]:not([hidden])', timeout=20000)
            pk = pg.inner_text('[data-gwp-picks]')
            check(f'{vn}: "Explore a PRISM report" links come from the release: Kingsford Waterbay and Hougang Central, never Thomson Three', 'Kingsford Waterbay' in pk and 'Hougang Central' in pk and 'Thomson' not in pk and pg.locator('[data-gwp-picks] a[href="#/prism/kingsford-waterbay"]').count() == 1, pk)
            order = pg.evaluate("[...document.querySelectorAll('#ws-dev > *')].map(e => e.id || e.getAttribute('data-gwp-picks') !== null && 'picks' || e.className).slice(0, 6)")
            check(f'{vn}: the search, then "If several match…" directly beneath it, then the PRISM report links', order[2:5] == ['sb', 'lgCount', 'picks'], order)
            gp = pg.evaluate("(() => { const a = document.querySelector('#sb').getBoundingClientRect(), b = document.querySelector('#lgCount').getBoundingClientRect(), c = document.querySelector('[data-gwp-picks]').getBoundingClientRect(); return [Math.round(b.top - a.bottom), Math.round(c.top - b.bottom), Math.round(c.height)]; })()")
            check(f'{vn}: tight spacing: hint and links close under the search', gp[0] <= 20 and gp[1] <= 20 and gp[2] <= (100 if w < 720 else 50), gp)
            g = pg.evaluate("""(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const l = r('[data-gwp-land]'), q = r('#sb'), h = r('#ws-dev > h2'), c = r('.gw-ropts'); return { lL: l.left, lR: l.right, lT: l.top, qL: q.left, qR: q.right, qB: q.bottom, hT: h.top, cR: c.right, cL: c.left }; })()""")
            if w >= 1200:
                check(f'{vn}: the explanation sits beside the search, top-aligned with its heading, right edge on the choice cards\' edge', g['lL'] > g['qR'] and abs(g['lT'] - g['hT']) < 2 and abs(g['lR'] - g['cR']) < 2, g)
            else:
                check(f'{vn}: the explanation follows the search, on the search column\'s edges', g['lT'] > g['qB'] and abs(g['lL'] - g['qL']) < 2 and g['lR'] <= g['qR'] + 2, g)
            check(f'{vn}: landing: no sideways scroll', pg.evaluate(NOOVER))
            # the Search button: inside the box, never over the words, the placeholder whole
            sg = pg.evaluate("""(() => { const q = document.getElementById('q'), b = document.querySelector('[data-search-go]'), cs = getComputedStyle(q), qr = q.getBoundingClientRect(), br = b.getBoundingClientRect();
              const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontSize + ' ' + cs.fontFamily; const textRight = qr.left + parseFloat(cs.paddingLeft) + c.measureText(q.placeholder).width;
              return { inBox: br.left >= qr.left && br.right <= qr.right + 0.5 && br.top >= qr.top && br.bottom <= qr.bottom + 0.5, gap: Math.round(br.left - textRight), ph: q.placeholder, label: b.innerText.replace(/\\s+/g, ' ').trim(), vis: br.width > 0 }; })()""")
            check(f'{vn}: Search button sits inside the box; the placeholder ends before it ("{sg["ph"]}", label "{sg["label"]}")', sg['inBox'] and sg['vis'] and sg['gap'] >= 4 and sg['label'].startswith('Search'), sg)
            pg.fill('#q', 'kingsford waterbay'); pg.wait_for_selector('#res [data-id="kingsford-waterbay"]', timeout=20000); typed = pg.evaluate("(() => { const q = document.getElementById('q'), b = document.querySelector('[data-search-go]'); const cs = getComputedStyle(q); const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontSize + ' ' + cs.fontFamily; return b.getBoundingClientRect().left - (q.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + c.measureText(q.value).width); })()")
            check(f'{vn}: typed words never run under the button', typed >= 4, typed)
            pg.click('[data-search-go]'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: Search property, exact name "kingsford waterbay": opens its PRISM Analysis', pg.url.endswith('#/prism/kingsford-waterbay'))
            pg.go_back(); pg.wait_for_selector('#q', timeout=20000); pg.fill('#q', ''); pg.click('[data-search-go]')
            check(f'{vn}: Search property with an empty box puts the cursor in it', pg.evaluate("document.activeElement && document.activeElement.id === 'q'") and '/prism/' not in pg.url)
            pg.fill('#q', 'kingsford'); pg.wait_for_selector('#res [data-id="kingsford-hillview-peak"]', timeout=20000); n = pg.locator('#res button[data-id]').count(); pg.click('[data-search-go]'); pg.wait_for_timeout(500)
            check(f'{vn}: ambiguous "kingsford" ({n} matches): Search property moves to the list, opens nothing', n > 1 and pg.evaluate("!!(document.activeElement && document.activeElement.dataset && document.activeElement.dataset.id)") and '/prism/' not in pg.url and pg.locator('#rwOver [data-ov]').count() == 0)
            pg.click('#res [data-id="kingsford-hillview-peak"]'); pg.wait_for_selector('[data-ov="dev"][data-ov-id="kingsford-hillview-peak"]', timeout=20000)
            check(f'{vn}: … choosing Kingsford Hillview Peak opens its Property Data overview (no PRISM)', '/prism/' not in pg.url and 'PRISM' not in pg.inner_text('#rwOver'))
            pg.fill('#q', ''); pg.fill('#q', 'kingsford'); pg.wait_for_selector('#res [data-id="kingsford-waterbay"]', timeout=20000); pg.click('#res [data-id="kingsford-waterbay"]'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: … choosing Kingsford Waterbay from the same list opens its PRISM Analysis', pg.url.endswith('#/prism/kingsford-waterbay'))
            # "Explore sales by size": its Property Data at the sizes section; Back returns to PRISM
            pg.click('[data-gwp-sizes]'); pg.wait_for_selector('#lgTypes', timeout=20000); pg.wait_for_timeout(800)
            check(f'{vn}: "Explore sales by size" opens Kingsford Waterbay\'s Property Data at "What each size sells for"', pg.url.endswith('#/p/kingsford-waterbay') and in_view(pg, '#lgTypesH'), pg.url)
            pg.go_back(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: … and Back returns to its PRISM Analysis', pg.url.endswith('#/prism/kingsford-waterbay'))
            pg.goto(B + '/research/'); pg.wait_for_selector('#q')
            # Research's own search leads with PRISM for Kingsford Waterbay
            pg.fill('#q', ''); pg.click('#q'); pg.keyboard.type('kingsford waterbay', delay=25); pg.wait_for_selector('#res [data-id="kingsford-waterbay"]', timeout=20000); pg.keyboard.press('Enter')
            pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: Research search, Kingsford Waterbay: opens its full PRISM Analysis directly (no summary step)', pg.url.endswith('#/prism/kingsford-waterbay') and KW['verdict']['headline'] in pg.inner_text('.gwp-card') and pg.locator('#rwOver [data-ov]').count() == 0)
            pg.go_back(); pg.wait_for_selector('#q', timeout=20000); pg.wait_for_timeout(500)
            check(f'{vn}: Back returns to the Research landing, explanation in place, no half-loaded overview', pg.url.rstrip('/').endswith('/research') or pg.url.endswith('/research/#/') or pg.url.endswith('/research/'), pg.url)
            check(f'{vn}: … and no stray "Loading…"', pg.locator('#rwOver [data-ov-busy]').count() == 0)
            pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            # the switch on both views
            check(f'{vn}: PRISM page: tabs with PRISM Analysis current', pg.get_attribute('[data-gwp-switch] [data-gwp-view="prism"]', 'aria-current') == 'page')
            calc = pg.get_attribute('[data-gwp-calc]', 'href')
            check(f'{vn}: "Calculate my purchase" opens the existing calculator clean (no price or development passed)', calc == '../tools/payment-planner/', calc)
            pg.click('[data-gwp-switch] [data-gwp-view="data"]'); pg.wait_for_selector('[data-gwp-switch] [data-gwp-view="data"][aria-current="page"]', timeout=20000)
            check(f'{vn}: switch to Property Data opens the existing report (#/p/), switch still there', pg.url.endswith('#/p/kingsford-waterbay') and pg.locator('header.lg-hero [data-gwp-switch]').count() == 1 and pg.locator('[data-gwp-switch]').count() == 1)
            pg.click('[data-gwp-switch] [data-gwp-view="prism"]'); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000)
            check(f'{vn}: and back to PRISM Analysis', pg.url.endswith('#/prism/kingsford-waterbay'))
            check(f'{vn}: arrangement: no script errors', not errs, errs[:2]); ctx.close()
        for w in [390, 1440]:
            ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/'); pg.wait_for_selector('#q')
            pg.click('#q'); pg.keyboard.type('hougang central', delay=25); pg.wait_for_selector('[data-gwp-sitelead]', timeout=20000)
            card = pg.locator('.v2-site:has([data-gwp-sitelead])')
            check(f'{w}px Research search, Hougang Central: PRISM Analysis leads, before "Open its site"', card.locator('a').first.get_attribute('data-gwp-sitelead') is not None and card.locator('a[data-kpt-ms]').count() == 1 and HC['verdict']['headline'] in card.inner_text())
            pg.click('[data-gwp-sitelead]'); pg.wait_for_selector('[data-gwp-page="hougang-central"]', timeout=20000)
            check(f'{w}px … and opens Hougang Central\'s PRISM Analysis; its Property Data is the launch page', pg.get_attribute('[data-gwp-switch] [data-gwp-view="data"]', 'href') == '#/p/hougang-central')
            check(f'{w}px Hougang Central: its HDB/condo finding is a Hidden connection; no "Explore sales by size" (no resales of its own)', HC['hiddenConnections'][0]['text'] in pg.inner_text('[data-gwp-hidden]') and pg.locator('[data-gwp-context]').count() == 0 and pg.locator('[data-gwp-sizes]').count() == 0)
            pg.goto(B + '/research/'); pg.wait_for_selector('#q'); pg.fill('#q', ''); pg.click('#q'); pg.keyboard.type('thomson three', delay=25); pg.wait_for_selector('#res [data-id="thomson-three"]', timeout=20000); pg.keyboard.press('Enter')
            pg.wait_for_selector('[data-ov="dev"][data-ov-id="thomson-three"]', timeout=20000); pg.wait_for_timeout(1200)
            check(f'{w}px Research search, Thomson Three: its Property Data overview, as before (no PRISM)', pg.url.endswith('/research/') or pg.url.endswith('#/'), pg.url)
            check(f'{w}px … no PRISM anywhere in it', 'PRISM' not in pg.inner_text('#rwOver') and pg.locator('#rwOver [data-ov-full]').count() >= 1)
            pg.goto(B + '/research/#/p/thomson-three'); pg.wait_for_selector('header.lg-hero', timeout=20000); pg.wait_for_timeout(1500)
            check(f'{w}px Thomson Three report: no switch', pg.locator('[data-gwp-switch]').count() == 0)
            # the global search is unchanged: a development opens Property Data
            pg.goto(B + '/'); pg.wait_for_selector('[data-gw-search] input:visible', timeout=20000)
            pg.locator('[data-gw-search] input:visible').first.click(); pg.keyboard.type('kingsford waterbay', delay=40)
            pg.wait_for_selector('a[data-gw-nav-to="development"]:visible', timeout=20000)
            href = pg.locator('a[data-gw-nav-to="development"]:visible').first.get_attribute('href')
            check(f'{w}px global search: Kingsford Waterbay still opens Property Data (#/p/), never PRISM', href and href.endswith('#/p/kingsford-waterbay') or (href and 'map/#p=kingsford-waterbay' in href), href)
            check(f'{w}px: no script errors', not errs, errs[:2]); ctx.close()
        # ---- the dimension rows (approved Summary-first correction): address, Back/Forward, a fresh visit, print, phones
        for w in [360, 390, 1440]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/#/prism/kingsford-waterbay/m'); pg.wait_for_selector('#gwpDimM:not([hidden])', timeout=20000); pg.wait_for_timeout(500)
            mt = pg.evaluate("(() => { const s = document.querySelector('#gwp-M').getBoundingClientRect(), b = document.querySelector('[data-gwp-bar]').getBoundingClientRect(); return Math.round(s.top - b.bottom); })()")
            check(f'{vn}: a direct link to one dimension (#/prism/…/m) opens Market Demand and moves to it; the others stay closed', -2 <= mt <= 60 and pg.locator('.gwp-dimp:not([hidden])').count() == 1, mt)
            pg.click('[data-gwp-toggle="S"]'); pg.wait_for_timeout(150)
            pg.click('.gwp-head [data-gwp-switch] [data-gwp-view="data"]'); pg.wait_for_selector('header.lg-hero [data-gwp-switch]', timeout=20000)
            pg.go_back(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(400)
            check(f'{vn}: Property Data and Back: the same dimensions are still open (Market Demand and Supply)', pg.locator('#gwpDimM').is_visible() and pg.locator('#gwpDimS').is_visible() and pg.locator('.gwp-dimp:not([hidden])').count() == 2)
            pg.go_forward(); pg.wait_for_selector('header.lg-hero [data-gwp-switch]', timeout=20000); pg.go_back(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(300)
            check(f'{vn}: Forward then Back again: still the same', pg.locator('.gwp-dimp:not([hidden])').count() == 2)
            pg.emulate_media(media='print'); pg.wait_for_timeout(200)
            check(f'{vn}: print shows every dimension in full and drops the sticky bar and controls', pg.evaluate("[...document.querySelectorAll('.gwp-dimp')].every(p => getComputedStyle(p).display !== 'none')") and pg.evaluate("getComputedStyle(document.querySelector('[data-gwp-bar]')).display") == 'none')
            pg.emulate_media(media='screen')
            rows = pg.evaluate("[...document.querySelectorAll('.gwp-dimb')].map(b => { const r = b.getBoundingClientRect(); const h = b.querySelector('.gwp-hl').getBoundingClientRect(); return [Math.round(r.width), Math.round(h.right - r.right)]; })")
            check(f'{vn}: dimension rows fit the screen; headlines stay inside their row', all(x[1] <= 0 for x in rows) and pg.evaluate(NOOVER), rows)
            check(f'{vn}: dimension rows: no script errors', not errs, errs[:2]); ctx.close()
            ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_selector('[data-gwp-page]', timeout=20000)
            check(f'{vn}: a fresh visit opens no dimension', pg.locator('.gwp-dimp:not([hidden])').count() == 0); ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
