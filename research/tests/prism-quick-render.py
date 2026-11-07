"""PRISM V3 quick read (Master Planning, 4 Nov 2026) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-quick-render.py   (LIVE=https://... against a deployed site; SHOTS=dir for screenshots)
Full, partial and limited-evidence pages, the protected Reveals, and the extremes.
 - the quick read opens the page, before the (hidden) full analysis and the five dimensions; its headline and figures are the renderer's
 - layout: three figures in a row (desktop), compact rows (phone), one column (200% zoom); nothing runs past its box; no sideways scroll
 - phone: the quick read is short (budget); no text below 9.5 px; every figure the same navy
 - "Explore full PRISM analysis" opens the V2 explanation in place and moves to it, and closes it again; a figure opens its dimension"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
import prism_detailed  # PRISM Research hero R1: these suites test the five dimensions, which are in Detailed
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('SHOTS')
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
# full evidence, partial, limited (D3: no price or resale), quiet without market change, protected Reveals, extremes
CASES = ['bartley-ridge', 'hundred-palms-residences', 'thomson-three', 'the-quinn', 'veranda', '8-raja', 'roots-at-transit', 'm5', 'boulevard-88', 'mendon-spring',
         'the-coast-at-sentosa-cove', 'the-verandah-residences', '91-marshall', '15-holland-hill']
PHONE_BUDGET = 1100   # px: the quick read on a 390 px phone (V2's card was 748-1,123 px; the prototype about 1,500 px)
# the future-MRT reading (gw-prism.js FM.ON, the 21 reviewed reports; Groundwork 01 / Master Planning, 6 Nov 2026): the MRT figure also shows
# Future MRT, so 20 px more, for those reports only
_FMON = re.search(r"ON: \{([^}]*)\}", (SITE / 'assets/js/gw-prism.js').read_text()).group(1)
FM_PILOT = set(re.findall(r"'([a-z0-9-]+)': true", _FMON)); PILOT_BUDGET = PHONE_BUDGET + 20
assert len(FM_PILOT) == 21, FM_PILOT
if os.environ.get('CASES'): CASES = os.environ['CASES'].split(',')   # e.g. the 21 future-MRT reports
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
EXPECT = "(id) => { const G = GW_PRISM, v = G._settled[id] && G._settled[id].v11; if (!v) return null; const q = G.quick11(v, v.name, G.reveal11(v)); return q && { head: q.head, figs: q.figs.map((f) => f.v) }; }"
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); heights = {}
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            for id in CASES:
                pg.goto(B + '/research/#/prism/' + id)
                try: pg.wait_for_selector(f'[data-gwp-page="{id}"] [data-gwp-quick]', timeout=30000)
                except Exception: check(f'{vn} {id}: the quick read loads', False, pg.url); continue
                pg.wait_for_timeout(300)
                ex = pg.evaluate(EXPECT, id); head = re.sub(r'\s+', ' ', pg.inner_text('.gwp-qr-h')).strip()
                figs = pg.evaluate("[...document.querySelectorAll('.gwp-qr .gwp-qr-f > b')].map(b => b.textContent)")   # the figure's own value (not the Future MRT part of the pilot's MRT figure)
                check(f'{vn} {id}: "{head}" with {figs}', ex is not None and head == ex['head'] and figs == ex['figs'] and 1 <= len(figs) <= 3, [ex, head, figs])
                order = pg.evaluate("(() => { const q = document.querySelector('.gwp-qr').getBoundingClientRect(), d = document.querySelector('#gwpDimsH').getBoundingClientRect(), f = document.querySelector('#gwp-full'); return [q.bottom <= d.top, f.hidden, document.querySelector('.gwp-qr').compareDocumentPosition(f) === 4]; })()")
                check(f'{vn} {id}: the quick read first; the full analysis hidden until asked for; the five dimensions below', all(order) and pg.locator('[data-gwp-pillar]').count() == 5, order)
                # PRISM Research hero R1 (Master Planning, 7 Nov 2026): with the hero's strip, the quick read's figures move into it (shown once); the strip's
                # layout is checked by prism-hero-render.py. Without a strip, the quick read keeps its own figures, laid out as before.
                strip = pg.evaluate("(() => { const s = document.querySelector('[data-gph-strip]'); return s ? [...s.querySelectorAll('[data-gph-fig] .gph-fv')].map(b => b.textContent) : null; })()")
                if strip is not None:
                    hid = pg.evaluate("[...document.querySelectorAll('.gwp-qr .gwp-qr-f')].every(f => !f.getClientRects().length)")
                    check(f'{vn} {id}: the quick read\'s figures are shown once, in the hero\'s strip ({len(figs)} of {len(strip)})', hid and all(f in strip for f in figs), [figs, strip])
                else:
                    tops = pg.evaluate("[...document.querySelectorAll('.gwp-qr .gwp-qr-f')].map(f => Math.round(f.getBoundingClientRect().top))")
                    n = len(tops); want = 1 if w >= 1024 else n
                    check(f'{vn} {id}: {"figures in one row" if w >= 1024 else "figures as compact rows"} ({n})', len(set(tops)) == want, tops)
                ov = pg.evaluate("[...document.querySelectorAll('.gwp-qr, .gwp-qr *')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id}: nothing runs past its box; no sideways scroll', all(x <= 1 for x in ov) and pg.evaluate(NOOVER), max(ov) if ov else None)
                cols = pg.evaluate("[...new Set([...document.querySelectorAll('.gwp-qr .gwp-qr-f b, .gwp-qr-h')].map(b => getComputedStyle(b).color))]")
                check(f'{vn} {id}: headline and figures in the same navy, whatever their sign', cols == ['rgb(22, 33, 62)'], cols)
                if w == 390:
                    h = pg.evaluate("document.querySelector('.gwp-qr').getBoundingClientRect().height"); heights[id] = round(h)
                    bud = PILOT_BUDGET if id in FM_PILOT else PHONE_BUDGET
                    check(f'{vn} {id}: phone: the quick read is {round(h)} px (budget {bud})', h <= bud, h)
                    small = pg.evaluate("Math.min(...[...document.querySelectorAll('.gwp-qr *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))")
                    check(f'{vn} {id}: phone: no text below 9.5 px', small >= 9.5, small)
                if SHOTS: os.makedirs(SHOTS, exist_ok=True); pg.locator('.gwp-qr').screenshot(path=f'{SHOTS}/{id}-{w}-quick.png')
                # "Explore full PRISM analysis": opens the V2 explanation in place, moves to it; a second press closes it
                pg.evaluate("document.querySelector('[data-gwp-full]').click()"); pg.wait_for_timeout(500)
                st = pg.evaluate("(() => { const f = document.querySelector('#gwp-full'), b = document.querySelector('[data-gwp-full]'), r = f.getBoundingClientRect(); return [!f.hidden, b.getAttribute('aria-expanded'), b.textContent.trim(), Math.round(r.top), !!f.querySelector('.gwp-xp, .gwp-rv11')]; })()")
                check(f'{vn} {id}: "Explore full PRISM analysis" opens the V2 explanation in place and moves to it', st[0] and st[1] == 'true' and st[2].startswith('Hide full PRISM analysis') and -5 <= st[3] <= 300 and st[4], st)
                pg.evaluate("document.querySelector('[data-gwp-full]').click()"); pg.wait_for_timeout(200)
                check(f'{vn} {id}: pressed again, it closes', pg.evaluate("document.querySelector('#gwp-full').hidden && document.querySelector('[data-gwp-full]').getAttribute('aria-expanded') === 'false'"))
                d0 = pg.evaluate("document.querySelector('.gwp-qr [data-gwp-xjump]').dataset.gwpXjump")
                pg.evaluate("document.querySelector('.gwp-qr [data-gwp-xjump]').click()"); pg.wait_for_timeout(500)
                st = pg.evaluate("(k) => { const t = document.querySelector('#gwp-' + k); return t ? [t.querySelector('[aria-expanded]') ? t.querySelector('[aria-expanded]').getAttribute('aria-expanded') : 'true', Math.round(t.getBoundingClientRect().top)] : null; }", d0)
                check(f'{vn} {id}: its first figure ({d0}) opens that dimension in place', st is not None and st[0] == 'true' and -5 <= st[1] <= 300, st)
                check(f'{vn} {id}: no script error', not errs, errs[:2])
            ctx.close()
        br.close()
        if heights: print('  phone quick-read heights (px):', json.dumps(heights))
finally:
    srv.terminate()
print('prism-quick-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
