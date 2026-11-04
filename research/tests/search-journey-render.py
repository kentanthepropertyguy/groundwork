"""Search journey (Master Planning, 4 Nov 2026) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/search-journey-render.py   (LIVE=https://... against a deployed site)
Every search that resolves to one development opens the same development page:
 - with a PRISM report: #/prism/<id>, the V3 quick read first, Property Data the adjacent tab (Regentville; Thomson Three from a list)
 - without one: #/p/<id> (the PRISM route replaces the address), Property Data first, the PRISM state stated plainly, never a link
   (Affinity at Serangoon: unavailable; Altura: pending; Grand Dunman: new launch)
Entry points: homepage search, header search on a calculator page, Research search (one match and a list of several); no intermediate
development summary. Back returns to where the search was made; Forward returns to the development; a replaced address leaves no extra
history entry. Deep links #/p/<id>/<sale> and #/prism/<id>/<dimension> are unchanged. Tab labels: a line under each from 720 px; phone
names only; nothing runs past its box; no sideways scroll; no script error."""
import os, pathlib, re, socket, subprocess, time
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
NA = {'unavailable': 'PRISM Analysis is not available for this development. Its prices, past sales and rents are below.',
      'pending': 'PRISM Analysis is not available for this development. Its prices, past sales and rents are below.',
      'new_launch': 'PRISM Analysis is not available for a new launch before it has its own price and resale evidence.'}
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
def path(pg): return pg.url.replace(B, '')
def wait_page(pg, id, prism):
    if prism: pg.wait_for_selector(f'[data-gwp-page="{id}"] .gwp-qr', timeout=30000)
    else: pg.wait_for_function(f"location.hash === '#/p/{id}' && !!document.querySelector('header.lg-hero h1')", timeout=30000)
    pg.wait_for_timeout(700)
def nav_search(pg, start, q, pick):
    pg.goto(B + start); pg.wait_for_timeout(1000)
    inp = pg.locator('[data-gw-search="home"] input')
    if start != '/' or not inp.count() or not inp.first.is_visible():
        b = pg.locator('[data-gw-open-search]').first
        if b.count() and b.is_visible(): b.click()
        else: pg.locator('details.gw-menu summary').first.click()
        pg.wait_for_timeout(400); inp = pg.locator('.gw-sx input:visible')
    inp = inp.first; inp.click(); inp.type(q, delay=30); pg.wait_for_timeout(1000)
    a = pg.locator('.gw-sx-res:not([hidden]) a').filter(has_text=pick).first
    href = a.get_attribute('href'); a.click(); return href
def research_search(pg, q, pick):
    pg.goto('about:blank'); pg.goto(B + '/research/'); pg.wait_for_selector('#gwHome input[type="search"], #gwHome input[type="text"]', state='visible', timeout=30000); pg.wait_for_timeout(600)
    inp = pg.locator('#gwHome input[type="search"], #gwHome input[type="text"]').first
    inp.scroll_into_view_if_needed(); inp.focus(); inp.type(q, delay=30); pg.wait_for_timeout(1000)   # focus: at 200% zoom the sticky header may cover the field's centre
    n = pg.locator('#gwHome [role=option]').count()
    o = pg.locator('#gwHome [role=option]').filter(has_text=pick).first; o.scroll_into_view_if_needed(); o.click(); return n
def tabs_ok(pg, vn, id, prism):
    t = pg.evaluate("""(() => { const n = document.querySelector('[data-gwp-switch]'); if (!n) return null; return [...n.querySelectorAll('a.gwp-tab')].map(a => [a.dataset.gwpView, a.getAttribute('href'), a.getAttribute('aria-current'), getComputedStyle(a.querySelector('.gwp-tsub')).display]); })()""")
    want = [['prism', f'#/prism/{id}', 'page' if prism else None], ['data', f'#/p/{id}', None if prism else 'page']]
    sub = 'none' if pg.viewport_size['width'] < 720 else 'block'
    check(f'{vn} {id}: tabs PRISM Analysis and Property Data, adjacent, the right one current; ' + ('a line under each' if sub == 'block' else 'names only on a phone'),
          t is not None and [x[:3] for x in t] == want and all(x[3] == sub for x in t), t)
def na_ok(pg, vn, id, state):
    r = pg.evaluate("""(() => { const n = document.querySelector('[data-gwp-na]'), p = document.querySelector('[data-gwp-na-note]');
      return n ? [n.dataset.gwpNa, p ? p.textContent : '', n.querySelectorAll('a').length, !!document.querySelector('[data-gwp-switch]'), n.querySelector('.gwp-tab--na').getAttribute('aria-disabled')] : null; })()""")
    check(f'{vn} {id}: Property Data first, the PRISM state "{state}" stated plainly, no link to PRISM', r is not None and r[0] == state and r[1] == NA[state] and r[2] == 0 and not r[3] and r[4] == 'true', r)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            # 1 homepage search -> a development with a report: PRISM first; Back to the homepage, Forward to PRISM
            href = nav_search(pg, '/', 'Regentville', 'Regentville'); wait_page(pg, 'regentville', True)
            check(f'{vn} homepage search -> Regentville: the link is research/#/prism/regentville and PRISM opens with its quick read', href.endswith('research/#/prism/regentville') and path(pg) == '/research/#/prism/regentville', [href, path(pg)])
            tabs_ok(pg, vn, 'regentville', True)
            pg.go_back(); pg.wait_for_timeout(1200); check(f'{vn} Back returns to the homepage', path(pg) in ('/', '/index.html'), path(pg))
            pg.go_forward(); wait_page(pg, 'regentville', True); check(f'{vn} Forward returns to Regentville\'s PRISM', path(pg) == '/research/#/prism/regentville', path(pg))
            # 2 header search on a calculator page -> a development without a report: Property Data first; the PRISM address replaced (no extra entry)
            href = nav_search(pg, '/tools/tdsr/', 'Affinity at Serangoon', 'Affinity at Serangoon'); wait_page(pg, 'affinity-at-serangoon', False)
            check(f'{vn} header search (calculator page) -> Affinity at Serangoon: Property Data at #/p/affinity-at-serangoon', href.endswith('research/#/prism/affinity-at-serangoon') and path(pg) == '/research/#/p/affinity-at-serangoon', [href, path(pg)])
            pg.wait_for_selector('[data-gwp-na]', timeout=20000); na_ok(pg, vn, 'affinity-at-serangoon', 'unavailable')
            pg.go_back(); pg.wait_for_timeout(1200); check(f'{vn} Back returns to the calculator (the replaced PRISM address left no history entry)', path(pg).startswith('/tools/tdsr/'), path(pg))
            pg.go_forward(); wait_page(pg, 'affinity-at-serangoon', False); check(f'{vn} Forward returns to Affinity at Serangoon\'s Property Data', path(pg) == '/research/#/p/affinity-at-serangoon', path(pg))
            # 3 Research search, one match each: no intermediate summary
            research_search(pg, 'Regentville', 'Regentville'); wait_page(pg, 'regentville', True)
            check(f'{vn} Research search -> Regentville: PRISM directly, no intermediate summary', path(pg) == '/research/#/prism/regentville' and not pg.evaluate("!!document.querySelector('#rwOver [data-ov-full]')"), path(pg))
            pg.go_back(); pg.wait_for_timeout(1200); check(f'{vn} Back returns to the Research landing', path(pg) in ('/research/', '/research/#/') and pg.evaluate("!!document.querySelector('#gwHome')"), path(pg))
            research_search(pg, 'Affinity at Serangoon', 'Affinity at Serangoon'); wait_page(pg, 'affinity-at-serangoon', False)
            check(f'{vn} Research search -> Affinity at Serangoon: Property Data directly (address /research/#/p/...), no intermediate summary', path(pg) == '/research/#/p/affinity-at-serangoon' and not pg.evaluate("!!document.querySelector('[data-ov-full]')"), path(pg))
            pg.wait_for_selector('[data-gwp-na]', timeout=20000); na_ok(pg, vn, 'affinity-at-serangoon', 'unavailable')
            # 4 Research search with several matches: the list is unchanged; a pick opens the development page (protected Thomson Three: PRISM)
            n = research_search(pg, 'Thomson', 'Thomson Three'); wait_page(pg, 'thomson-three', True)
            check(f'{vn} Research search "Thomson": a list of {n} matches, and the pick opens Thomson Three\'s PRISM', n >= 5 and path(pg) == '/research/#/prism/thomson-three', [n, path(pg)])
            # 5 the other states, from deep links (pending, new launch); a report shows no state
            for id, st in [('altura', 'pending'), ('grand-dunman', 'new_launch')]:
                pg.goto(B + '/research/#/p/' + id); pg.wait_for_timeout(1500)
                try: pg.wait_for_selector('[data-gwp-na]', timeout=20000); na_ok(pg, vn, id, st)
                except Exception: check(f'{vn} {id}: the PRISM state "{st}"', False, 'no state shown')
            pg.goto(B + '/research/#/p/regentville'); pg.wait_for_selector('[data-gwp-switch]', timeout=30000); pg.wait_for_timeout(500)
            tabs_ok(pg, vn, 'regentville', False)
            check(f'{vn} regentville Property Data: a report shows its tabs, never the "not available" state', not pg.evaluate("!!document.querySelector('[data-gwp-na]')"))
            hdr = pg.evaluate("[...document.querySelectorAll('header.lg-hero [data-gwp-switch] .gwp-tab, header.lg-hero [data-gwp-switch] .gwp-tab *')].map(e => e.scrollWidth - e.clientWidth)")
            check(f'{vn} the tabs fit; no sideways scroll', all(x <= 1 for x in hdr) and pg.evaluate(NOOVER), max(hdr) if hdr else None)
            # 6 deep links unchanged
            pg.goto(B + '/research/#/p/regentville/resale'); pg.wait_for_timeout(2500)
            check(f'{vn} deep link #/p/regentville/resale stays on Property Data', path(pg) == '/research/#/p/regentville/resale' and pg.evaluate("!!document.querySelector('header.lg-hero h1')"), path(pg))
            pg.goto(B + '/research/#/prism/regentville/i'); pg.wait_for_selector('[data-gwp-page="regentville"]', timeout=30000); pg.wait_for_timeout(900)
            check(f'{vn} deep link #/prism/regentville/i opens Infrastructure', path(pg) == '/research/#/prism/regentville/i' and pg.evaluate("document.querySelector('[data-gwp-toggle=\"I\"]').getAttribute('aria-expanded')") == 'true', path(pg))
            check(f'{vn} no script error', not errs, errs[:2])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('search-journey-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
