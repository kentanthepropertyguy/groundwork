"""PRISM V1.1 (A1) in a real browser at 1440, 390 and 195 px (200% zoom on a phone).
Run from the site folder:  python3 research/tests/prism-v11-render.py
 Kingsford Waterbay: Price Position's headline is its approved position with its period; P, R and M each show their peer position (label,
   exact period, statement, peer counts), P with the peer window explanation; M shows the gross yield bands and Hougang's household income;
   Sources list SingStat. Hougang Central: income only. Thomson Three: no PRISM page.
 Fails closed in the browser: a changed V1.1 report, a changed or missing V1.1 manifest -> the page is exactly the V1 page (no V1.1 part).
 Never: a score, purchasing power, affordability or OneMap wording; sideways scrolling; a script error."""
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
KW = json.loads((SITE / 'data/prism/v1.1/reports/kingsford-waterbay.json').read_text())
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
TXT = "s=>{const e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():''}"
def fresh(br, w, tamper=None):
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    if tamper: pg.route(re.compile(tamper[0]), tamper[1])
    return ctx, pg, errs
def open_prism(pg, id):
    pg.goto(B + '/research/#/prism/' + id); pg.wait_for_selector('[data-gwp-page]', timeout=30000); pg.wait_for_timeout(600)
    pg.click('[data-gwp-all="open"]'); pg.wait_for_timeout(300)
def dimtext(pg, k): return pg.evaluate(TXT, '#gwp-' + k)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            open_prism(pg, 'kingsford-waterbay')
            hl = pg.evaluate(TXT, '#gwp-P [data-gwp-headline]')
            check(f'{vn} KW: Price Position headline is its approved position and period', hl == '9.9% below its local comparablesLower relative price than most peers · Oct 2024–Sep 2026', hl)
            for x in KW['peerComparison']['positions']:
                t = dimtext(pg, x['dimension'])
                check(f'{vn} KW {x["dimension"]}: "{x["bandLabel"]}" with "{x["periodLabel"]}", the statement verbatim, peer group 116', x['bandLabel'] in t and x['periodLabel'] in t and x['statement'] in t and '116 developments' in t, t[-400:])
            check(f'{vn} KW P: the peer window explanation', 'This development: Oct 2024–Sep 2026. Comparison developments were measured over their own latest 12 to 36 months.' in dimtext(pg, 'P'))
            rows = pg.evaluate("()=>[...document.querySelectorAll('[data-gwp-yield] tbody tr')].map(r=>r.textContent.replace(/\\s+/g,' ').trim())")
            check(f'{vn} KW M: three yield bands, each with rent, contracts, price, resales, yield and range', len(rows) == 3 and all(s in rows[0] for s in ['400–499 sq ft', '$2,575', '62 contracts', '$706,500', '12 resales', '4.37%', '4.17–4.64%', 'Median 4.3% of 27']) and '3.76%' in rows[1] and '3.56%' in rows[2], rows)
            m = dimtext(pg, 'M')
            check(f'{vn} KW M: the yield caption with the lease, and the income panel (Hougang, GHS 2025, 50.4% at $10,000 or more, "This describes the area, not buyers.")', KW['rentalYield']['caption'] in m and 'Hougang planning area' in m and 'GHS 2025' in m and '$10,000 or more' in m and '50.4%' in m and 'This describes the area, not buyers.' in m)
            src = pg.evaluate(TXT, '[data-gwp-sources]')
            check(f'{vn} KW sources: SingStat GHS 2025 with its attribution; V1.1 periods stated', 'SingStat, General Household Survey 2025, table C020145' in src and 'PRISM V1.1 additions' in src, src[-300:])
            body = pg.evaluate(TXT, '[data-gwp-page]')
            check(f'{vn} KW: no score, purchasing power, affordability or OneMap wording; "PRISM gives no overall score" kept', not re.search(r'\bscores?\b(?! *\))|/\s*100|purchasing|affordab|everyday access', body.replace('PRISM gives no overall score', '').replace('not scored', '')) and 'PRISM gives no overall score' in body)
            check(f'{vn} KW: the Summary card is unchanged (verdict first)', pg.locator('.gwp-card.gwp-open .gwp-vh').count() == 1 and pg.locator('.gwp-card [data-gwp-v11]').count() == 0)
            check(f'{vn} KW: no sideways scroll, no script error', pg.evaluate(NOOVER) and not errs, errs[:2])
            open_prism(pg, 'hougang-central')
            check(f'{vn} HC: household income only (Market Demand); no peer position or yield; Price Position still "Not assessed"', pg.locator('[data-gwp-income]').count() == 1 and pg.locator('[data-gwp-yield]').count() == 0 and pg.locator('[data-gwp-v11="P"],[data-gwp-v11="R"],[data-gwp-v11="M"]').count() == 0 and 'Not assessed in this report' in pg.evaluate(TXT, '#gwp-P [data-gwp-headline]'))
            check(f'{vn} HC: no sideways scroll, no script error', pg.evaluate(NOOVER) and not errs, errs[:2])
            pg.goto(B + '/research/#/prism/thomson-three'); pg.wait_for_timeout(2500)
            check(f'{vn} Thomson Three: no PRISM page (V1.1 never makes one)', pg.locator('[data-gwp-page]').count() == 0 and '#/prism/' not in pg.url, pg.url)
            ctx.close()
        # fails closed: each tamper leaves the V1 page exactly
        ctx, pg, errs = fresh(br, 1440); pg.goto(B + '/research/#/prism/kingsford-waterbay'); pg.wait_for_selector('[data-gwp-page]'); pg.wait_for_timeout(600)
        ctx.close()
        def body(r, f): resp = r.fetch(); r.fulfill(response=resp, body=f(resp.text()))
        cases = [('a changed V1.1 report (6.4 -> 7.4)', (r'data/prism/v1\.1/reports/kingsford-waterbay\.json', lambda r: body(r, lambda t: t.replace('6.4 resales', '7.4 resales')))),
                 ('a changed V1.1 manifest', (r'data/prism/v1\.1/manifest\.json', lambda r: body(r, lambda t: t.replace('"items": 7', '"items": 8')))),
                 ('a missing V1.1 manifest', (r'data/prism/v1\.1/manifest\.json', lambda r: r.fulfill(status=404, body=''))),
                 ('a V1.1 report pairing with another V1 file', (r'data/prism/v1\.1/manifest\.json', lambda r: body(r, lambda t: t.replace('2d7266d3', '2d7266d4'))))]
        for name, tp in cases:
            ctx, pg, errs = fresh(br, 1440, tp); open_prism(pg, 'kingsford-waterbay')
            check(f'fails closed, {name}: no V1.1 part anywhere; the page is V1 (Price Position "Not assessed"); no script error', pg.locator('[data-gwp-v11],[data-gwp-yield],[data-gwp-income],[data-gwp-v11-src]').count() == 0 and 'Not assessed in this report' in pg.evaluate(TXT, '#gwp-P [data-gwp-headline]') and pg.locator('[data-gwp-page]').count() == 1 and not errs, errs[:2])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-v11-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
