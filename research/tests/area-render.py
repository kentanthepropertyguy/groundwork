"""Neighbourhood Intelligence V1 (Master Planning, 4 Nov 2026: Concept 1) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/area-render.py   (LIVE=https://... against a deployed site)
1 research/#/area/hougang: the answer first (three figures, each with its qualifier and period, then one warning), the approved
  insights, five figure groups (none open on a first visit; each opens directly below its own row, independently; Expand all / Collapse
  all; the open set survives a round trip), Future supply's unpublished records in words, every source's attribution; an unknown area
  returns to Research
2 the link: under the five PRISM dimensions of a development in Claude C's verified list (Kingsford Waterbay, Regentville, Hundred Palms
  Residences), before the sources; none on a development outside it (Bartley Ridge); it opens the neighbourhood; Back returns there
3 Research search: "Hougang" offers the neighbourhood first, Enter opens it; "Hougang Central" does not; the search journey is unchanged
4 fail closed: a changed data file shows no page and no link
5 nothing runs past its box; no sideways scroll; no script error"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:400] if info else ''))
s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
DATA = json.loads((SITE / 'data/neighbourhood/v1/hougang.json').read_text())
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
OVER = "[...document.querySelectorAll('[data-gwa-page] *, [data-gwa-link], [data-gwa-link] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0).map((e) => e.className).slice(0, 3)"
GROUPS = """(() => [...document.querySelectorAll('[data-gwa-toggle]')].map((b) => { const p = document.getElementById(b.getAttribute('aria-controls')), r = b.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return { k: b.dataset.gwaToggle, open: b.getAttribute('aria-expanded') === 'true' && !p.hidden, rowB: Math.round(r.bottom), pT: Math.round(pr.top), pB: Math.round(pr.bottom) }; }))()"""
openset = lambda d: ''.join(x['k'] for x in d if x['open'])
def click(pg, sel):
    el = pg.locator(sel).first; el.scroll_into_view_if_needed(); el.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)   # keyboard: at 200% zoom sticky bars may cover a centre
def go(pg, h, sel):
    pg.goto('about:blank'); pg.goto(B + h); pg.wait_for_selector(sel, timeout=30000); pg.wait_for_timeout(600)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500; H = {1440: 900, 390: 844, 195: 422}[w]
            ctx = br.new_context(viewport={'width': w, 'height': H}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            # 1 the page
            go(pg, '/research/#/area/hougang', '[data-gwa-page="hougang"]')
            sm = pg.evaluate("""(() => { const q = document.querySelector('[data-gwa-summary]'), y = (e) => Math.round(e.getBoundingClientRect().top + scrollY);
              const f = [...q.querySelectorAll('[data-gwa-fig]')], w = q.querySelectorAll('[data-gwa-warn]');
              return { title: document.title, h1: document.querySelector('h1').textContent, figs: f.map((x) => [x.querySelector('b').textContent, !!x.querySelector('.gwa-q').textContent, !!x.querySelector('.gwa-t').textContent]),
                warns: w.length, warnAfter: w.length && f.length ? y(w[0]) > Math.max(...f.map(y)) : false, ins: [...document.querySelectorAll('[data-gwa-insight]')].map((x) => x.querySelector('.gwa-it').textContent + '|' + x.querySelector('.gwa-iq').textContent) }; })()""")
            check(f'{vn} the Hougang page: title and heading', sm['title'] == 'Hougang neighbourhood — Research — Groundwork' and sm['h1'] == 'Hougang', [sm['title'], sm['h1']])
            check(f'{vn} the answer first: three figures, each with its qualifier and period, then one warning', len(sm['figs']) == 3 and all(f[1] and f[2] for f in sm['figs']) and sm['warns'] == 1 and sm['warnAfter'], sm['figs'])
            check(f'{vn} the approved insights, each with its qualifier ({len(sm["ins"])})', sm['ins'] == [i['text'] + '|' + i['qualifier'] for i in DATA['insights']], sm['ins'][:2])
            d = pg.evaluate(GROUPS)
            check(f'{vn} five figure groups, none open on a first visit', [x['k'] for x in d] == list('HRACF') and openset(d) == '', [(x['k'], x['open']) for x in d])
            click(pg, '[data-gwa-toggle="A"]'); d = pg.evaluate(GROUPS); A_, C_ = d[2], d[3]
            check(f'{vn} Resale rates opens alone, directly below its own row', openset(d) == 'A' and abs(A_['pT'] - A_['rowB']) <= 24 and C_['rowB'] > A_['pB'], [openset(d), A_])
            click(pg, '[data-gwa-toggle="F"]'); d = pg.evaluate(GROUPS); check(f'{vn} Future supply opens without closing Resale rates', openset(d) == 'AF', openset(d))
            fs = pg.evaluate("document.getElementById('gwaGF').innerText")
            check(f'{vn} Future supply: unsold (S3) and pipeline (S4) "Not published in this release", future HDB "Not assessed", Hougang Central dated and outside any supply count',
                  fs.count('Not published in this release') == 2 and 'still being verified' in fs and 'cannot yet be matched' in fs and 'Not assessed' in fs and 'Hougang Central' in fs and 'not added to any supply count' in fs and not re.search(r'unsold[^\n]*\n?\s*0\b|\bnone\b', fs, re.I), fs[:300])
            click(pg, '[data-gwa-all="open"]'); d = pg.evaluate(GROUPS); check(f'{vn} Expand all opens all five', openset(d) == 'HRACF', openset(d))
            click(pg, '[data-gwa-all="close"]'); d = pg.evaluate(GROUPS); check(f'{vn} Collapse all closes all five', openset(d) == '', openset(d))
            click(pg, '[data-gwa-toggle="R"]'); click(pg, '[data-gwa-toggle="C"]')
            src = pg.evaluate("(() => { const s = document.querySelector('[data-gwa-sources]'); s.open = true; return [...s.querySelectorAll('[data-gwa-source] small')].map((x) => x.textContent); })()")
            check(f'{vn} every source with its attribution ({len(src)})', src == [x['attribution'] for x in DATA['sources']])
            check(f'{vn} nothing runs past its box; no sideways scroll', not pg.evaluate(OVER) and pg.evaluate(NOOVER), pg.evaluate(OVER))
            # 2 the link under the five PRISM dimensions
            go(pg, '/research/#/prism/kingsford-waterbay', '[data-gwa-link="hougang"]')
            lk = pg.evaluate("""(() => { const a = document.querySelector('[data-gwa-link]'), dims = document.querySelector('.gwp-dims'), src = document.querySelector('[data-gwp-sources]');
              return { after: dims.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING, before: !!(a.compareDocumentPosition(src) & Node.DOCUMENT_POSITION_FOLLOWING), prev: a.previousElementSibling === dims, n: document.querySelectorAll('[data-gwa-link]').length, text: a.innerText }; })()""")
            check(f'{vn} Kingsford Waterbay: one link directly under the five dimensions, before the sources; words only', lk['prev'] and lk['before'] and lk['n'] == 1 and not re.search(r'\d', lk['text']), lk)
            check(f'{vn} the link does not run past its box', not pg.evaluate(OVER) and pg.evaluate(NOOVER), pg.evaluate(OVER))
            click(pg, '[data-gwa-link]'); pg.wait_for_selector('[data-gwa-page="hougang"]', timeout=20000); pg.wait_for_timeout(500)
            d = pg.evaluate(GROUPS); check(f'{vn} the link opens the neighbourhood, with the groups opened earlier still open (R, C)', openset(d) == 'RC', openset(d))
            pg.go_back(); pg.wait_for_selector('[data-gwp-page="kingsford-waterbay"]', timeout=20000); pg.wait_for_timeout(800)
            check(f'{vn} Back returns to Kingsford Waterbay\'s PRISM page, the link again under the dimensions', pg.url.endswith('#/prism/kingsford-waterbay') and pg.locator('[data-gwa-link]').count() == 1, pg.url)
            for dev in ['regentville', 'hundred-palms-residences']:   # in Claude C's verified list (132, by position inside the Master Plan 2019 boundary)
                go(pg, '/research/#/prism/' + dev, f'[data-gwp-page="{dev}"] + *, [data-gwa-link="hougang"]'); pg.wait_for_timeout(300)
                n = pg.evaluate("(() => { const a = document.querySelector('[data-gwa-link]'); return a && a.previousElementSibling === document.querySelector('.gwp-dims') ? 1 : 0; })()")
                check(f'{vn} {dev} (in the verified list): the link under its five dimensions', n == 1)
            go(pg, '/research/#/prism/bartley-ridge', '[data-gwp-page="bartley-ridge"]'); pg.wait_for_timeout(2500)
            check(f'{vn} Bartley Ridge (not in the verified list): no neighbourhood link', pg.locator('[data-gwa-link]').count() == 0)
            # 3 Research search
            go(pg, '/research/', '#gwHome input[type="text"]'); inp = pg.locator('#gwHome input[type="text"]').first; inp.scroll_into_view_if_needed(); inp.focus(); inp.type('Hougang', delay=30); pg.wait_for_timeout(1300)
            first = pg.evaluate("(() => { const b = document.querySelector('#gwHome #res button'); return b ? [b.dataset.area || '', b.innerText.replace(/\\s+/g, ' ')] : null; })()")
            check(f'{vn} Research search "Hougang": the neighbourhood is offered first', first and first[0] == 'hougang' and 'Neighbourhood' in first[1], first)
            pg.keyboard.press('Enter'); pg.wait_for_selector('[data-gwa-page="hougang"]', timeout=20000)
            check(f'{vn} Enter opens it at research/#/area/hougang', pg.url.endswith('/research/#/area/hougang'), pg.url)
            pg.go_back(); pg.wait_for_timeout(1200); check(f'{vn} Back returns to Research', pg.url.replace(B, '') in ('/research/', '/research/#/'), pg.url)
            go(pg, '/research/', '#gwHome input[type="text"]'); inp = pg.locator('#gwHome input[type="text"]').first; inp.scroll_into_view_if_needed(); inp.focus(); inp.type('Hougang Central', delay=30); pg.wait_for_timeout(1300)
            check(f'{vn} "Hougang Central" is not offered the neighbourhood', pg.locator('[data-gwa-row]').count() == 0)
            pg.goto('about:blank'); pg.goto(B + '/research/#/area/nowhere'); pg.wait_for_timeout(2500)
            check(f'{vn} an unknown area returns to Research', pg.url.replace(B, '') in ('/research/', '/research/#/'), pg.url)
            check(f'{vn} no script error', not errs, errs[:2])
            ctx.close()
        # 4 fail closed: the data file changed (one figure) -> no page and no link
        ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
        pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
        def tamper(route):
            r = route.fetch(); t = r.text().replace('"value": 59485', '"value": 59486', 1); route.fulfill(response=r, body=t)
        pg.route(re.compile(r'data/neighbourhood/v1/hougang\.json'), tamper)
        pg.goto(B + '/research/#/area/hougang'); pg.wait_for_timeout(3000)
        check('fail closed: a changed data file shows no neighbourhood page', pg.locator('[data-gwa-page]').count() == 0 and pg.url.replace(B, '') in ('/research/', '/research/#/'), pg.url)
        pg.goto('about:blank'); pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_selector('[data-gwp-page]', timeout=30000); pg.wait_for_timeout(2500)
        check('fail closed: and no link from the PRISM page', pg.locator('[data-gwa-link]').count() == 0)
        ctx.close(); br.close()
finally:
    srv.terminate()
print('area-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
