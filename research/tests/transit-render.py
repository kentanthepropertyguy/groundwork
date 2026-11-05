"""MRT today and future MRT on the Property Data page (Future MRT Phase 2 pilot, Groundwork 01, 6 Nov 2026) in a real browser:
desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/transit-render.py   (LIVE=https://... against a deployed site)
1 Hundred Palms Residences (#/p/): inside Location & amenities, below the map and its nearest-places list, above "Explore the full Map":
  MRT today (Hougang 1,600 m, Kovan 1,610 m, in service) and Future MRT (Serangoon North 300 m, Tavistock 1,370 m, the Hougang Cross Island
  Line interchange 1,600 m; each under construction, LTA target 2030), the approved note and the sources; the LTA website is not linked
2 a development without approved transit data (Kingsford Waterbay) shows none and no error
3 PRISM and the Map are unchanged: no transit block on Hundred Palms' PRISM page or on the Map
4 fail closed: a changed data file (or index) shows nothing, and the rest of the page is unaffected
5 nothing runs past its box; no sideways scroll; the LTA target never splits across lines; no script error"""
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
HPR = 'hundred-palms-residences'
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
OVER = "[...document.querySelectorAll('[data-gwt], [data-gwt] *')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0).map((e) => e.className).slice(0, 3)"
READ = """(() => { const g = document.querySelector('[data-gwt]'); if (!g) return null; const sec = g.closest('[data-lg-loc]'), map = sec.querySelector('[data-gwl]'), full = sec.querySelector('[data-gwl-full]');
  const rows = (k) => [...g.querySelectorAll('[data-gwt-' + k + '] li')].map((li) => li.innerText.replace(/\\s+/g, ' ').trim());
  const tg = [...g.querySelectorAll('[data-gwt-target]')].map((e) => e.getClientRects().length);
  return { inLoc: !!sec, afterMap: !!(map && (map.compareDocumentPosition(g) & 4)), beforeFull: !!(full && (g.compareDocumentPosition(full) & 4)), today: rows('today'), future: rows('future'),
    note: (g.querySelector('[data-gwt-note]') || {}).innerText || '', src: (g.querySelector('[data-gwt-src]') || {}).innerText || '', links: [...g.querySelectorAll('a')].map((a) => a.href), targetLines: tg,
    text: g.innerText }; })()"""
def page(ctx, h, errs):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|connect\.facebook|onemap\.gov\.sg/maps/tiles'), lambda r: r.fulfill(status=200, body=''))
    pg.goto(B + h); return pg
def to_loc(pg):
    pg.wait_for_selector('[data-lg-loc]', timeout=30000); pg.evaluate("document.querySelector('[data-lg-loc]').scrollIntoView()")
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('1440', dict(viewport={'width': 1440, 'height': 900})), ('390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)),
                       ('195', dict(viewport={'width': 195, 'height': 422}, is_mobile=True, has_touch=True))]:
            ctx = br.new_context(**kw); errs = []
            # 1 Hundred Palms Residences
            pg = page(ctx, '/research/#/p/' + HPR, errs); to_loc(pg); pg.wait_for_selector('[data-gwt]', timeout=15000); pg.wait_for_timeout(600)
            r = pg.evaluate(READ)
            check(f'{vn} Hundred Palms: in Location & amenities, below the map and its list, above "Explore the full Map"', r and r['inLoc'] and r['afterMap'] and r['beforeFull'], r and {k: r[k] for k in ('inLoc', 'afterMap', 'beforeFull')})
            check(f'{vn} MRT today: Hougang 1,600 m and Kovan 1,610 m, in service, nearest first', r['today'] == ['Hougang MRT about 1,600 m In service', 'Kovan MRT about 1,610 m In service'], r['today'])
            check(f'{vn} Future MRT: Serangoon North 300 m, Tavistock 1,370 m, Hougang interchange 1,600 m; Cross Island Line, under construction, LTA target 2030', r['future'] == [
                'Serangoon North MRT about 300 m Cross Island Line (CR9) · Under construction · LTA target 2030',
                'Tavistock MRT about 1,370 m Cross Island Line (CR10) · Under construction · LTA target 2030',
                'Hougang MRT about 1,600 m Cross Island Line interchange (CR8) · Under construction · LTA target 2030 New platforms at today’s station. Distance to today’s station exits.'], r['future'])
            check(f'{vn} the approved note; sources dated; the LTA website not linked', 'Opening dates are LTA targets and can change. Planned stations are facts, not part of any comparison.' in r['note'] and 'last updated 4 Aug 2026' in r['src'] and 'checked 6 Nov 2026' in r['src'] and
                  not any('lta.gov.sg' in l for l in r['links']) and len(r['links']) == 2 and all(l.startswith('https://data.gov.sg/') for l in r['links']), r['links'])
            check(f'{vn} no price, value, rank, score, forecast or appreciation wording', not re.search(r'apprecia|uplift|price|value|invest|premium|rank|score|percentile|closer than|similar developments|forecast', r['text'], re.I))
            check(f'{vn} each "LTA target 2030" on one line; nothing runs past its box; no sideways scroll', all(n == 1 for n in r['targetLines']) and not pg.evaluate(OVER) and pg.evaluate(NOOVER), [r['targetLines'], pg.evaluate(OVER)])
            # 2 no approved data
            pg2 = page(ctx, '/research/#/p/kingsford-waterbay', errs); to_loc(pg2); pg2.wait_for_timeout(2500)
            check(f'{vn} Kingsford Waterbay (no approved transit data): no block', pg2.locator('[data-gwt]').count() == 0)
            # 3 PRISM and the Map unchanged
            pg3 = page(ctx, '/research/#/prism/' + HPR, errs); pg3.wait_for_selector(f'[data-gwp-page="{HPR}"]', timeout=30000); pg3.wait_for_timeout(1500)
            check(f'{vn} Hundred Palms PRISM page: no transit block (PRISM unchanged)', pg3.locator('[data-gwt]').count() == 0)
            if vn == '1440':
                pg4 = page(ctx, '/research/map/#p=' + HPR, errs); pg4.wait_for_timeout(3500)
                check(f'{vn} the Map: no transit block (Map unchanged)', pg4.locator('[data-gwt]').count() == 0)
                # 4 fail closed: a changed file, then a changed index
                for what, pat, a, b in [('data file', '**/data/transport/v1/hundred-palms-residences.json*', '1370', '1360'), ('index', '**/data/transport/v1/index.json*', '2026-11-06', '2026-11-07')]:
                    c2 = br.new_context(**kw); e2 = []; q = c2.new_page(); q.on('pageerror', lambda e: e2.append(str(e)))
                    q.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg/maps/tiles'), lambda rr: rr.fulfill(status=200, body=''))
                    q.route(pat, lambda rr: rr.fulfill(status=200, content_type='application/json', body=rr.fetch().text().replace(a, b)))
                    q.goto(B + '/research/#/p/' + HPR); to_loc(q); q.wait_for_timeout(3000)
                    check(f'fail closed: a changed {what} shows no block; the map section and the rest of the page are unaffected', q.locator('[data-gwt]').count() == 0 and q.locator('[data-gwl-full]').count() == 1 and q.locator('#lgPick').count() == 1 and not e2, e2)
                    c2.close()
            check(f'{vn} no script error', not errs, errs[:3])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'transit-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
