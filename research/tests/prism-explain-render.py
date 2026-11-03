"""The PRISM buyer explanation V2 (Master Planning, 3 Nov 2026) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-explain-render.py   (LIVE=https://... to run against a deployed site; SHOTS=dir for screenshots)
Representative pages: the pilot, the curated Reveals, D3 and market-missing partial reports, and the extremes (highest premium, deepest
discount, highest turnover, farthest from MRT, largest market rise and fall, fewest homes).
 - the explanation opens the page, above the five dimensions; its figures are the renderer's approved values, meaning first (no sign)
 - layout: four cards in one row (desktop), a 2 x 2 grid (phone), one column (200% zoom); nothing runs past its box; no sideways scroll
 - phone: the peer count, period and "Details" stay in the dimension; the price limitation stays visible; the card is short (budget)
 - every figure in the same navy (no colour by sign); a card opens its own dimension, in place; no script error"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
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
CASES = ['bartley-ridge', 'hundred-palms-residences', 'thomson-three', 'the-quinn', 'veranda', 'roots-at-transit', 'boulevard-88', 'mendon-spring', 'm5',
         'the-coast-at-sentosa-cove', 'the-verandah-residences', 'villa-de-west', '91-marshall']
PHONE_BUDGET = 1250   # px: the explanation card on a 390 px phone (the prototype's Bartley Ridge card was about 1,500 px)
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
EXPECT = """(id) => { const G = GW_PRISM, m = G._settled[id], v = m && m.v11; if (!v) return null; const op = G.reveal11(v), x = G.explain11(v, v.name, op);
  return x && { head: x.head, figs: x.cards.map((c) => c.v), dims: x.cards.map((c) => c.dim) }; }"""
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        heights = {}
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            for id in CASES:
                pg.goto(B + '/research/#/prism/' + id)
                # V3 (Master Planning, 4 Nov 2026): the V2 explanation sits behind "Explore full PRISM analysis"; open it, then check V2 as before
                try: pg.wait_for_selector(f'[data-gwp-page="{id}"] [data-gwp-full]', timeout=30000); pg.click('[data-gwp-full]'); pg.wait_for_selector(f'[data-gwp-page="{id}"] .gwp-xp', timeout=30000)
                except Exception: check(f'{vn} {id}: the explanation loads', False, pg.url); continue
                pg.wait_for_timeout(300)
                ex = pg.evaluate(EXPECT, id)
                figs = pg.evaluate("[...document.querySelectorAll('.gwp-xp .gwp-xf b')].map(b => b.textContent)")
                head = re.sub(r'\s+', ' ', pg.text_content('.gwp-xp')).strip()
                check(f'{vn} {id}: the explanation, its headline and the approved figures {figs}, meaning first', ex is not None and figs == ex['figs'] and ex['head'] in head and not any(re.search('[−+]', f) for f in figs), [ex, figs])
                order = pg.evaluate("(() => { const x = document.querySelector('.gwp-xp').getBoundingClientRect(), d = document.querySelector('#gwpDimsH').getBoundingClientRect(); return x.bottom <= d.top; })()")
                check(f'{vn} {id}: above the five dimensions (five still there)', order and pg.locator('[data-gwp-pillar]').count() == 5)
                tops = pg.evaluate("[...document.querySelectorAll('.gwp-xp .gwp-xf')].map(f => Math.round(f.getBoundingClientRect().top))")
                n = len(tops); rows = len(set(tops)); want = 1 if w >= 1024 else (n + 1) // 2 if w >= 360 else n
                check(f'{vn} {id}: {"one row" if w >= 1024 else "a 2 x 2 grid" if w >= 360 else "one column"} of {n} cards', rows == want, tops)
                ov = pg.evaluate("[...document.querySelectorAll('.gwp-xp .gwp-xf, .gwp-xp .gwp-xf *')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id}: every card fits (nothing runs past its box); no sideways scroll', all(x <= 1 for x in ov) and pg.evaluate(NOOVER), max(ov) if ov else None)
                cols = pg.evaluate("[...new Set([...document.querySelectorAll('.gwp-xp .gwp-xf b')].map(b => getComputedStyle(b).color))]")
                check(f'{vn} {id}: every figure in the same navy, whatever its sign', cols == ['rgb(22, 33, 62)'], cols)
                if w == 390:
                    vis = pg.evaluate("['.gwp-xd', '.gwp-xt', '.gwp-xm', '.gwp-xw--k'].map(s => [...document.querySelectorAll('.gwp-xp ' + s)].map(e => getComputedStyle(e).display !== 'none'))")
                    check(f'{vn} {id}: phone: peer counts, periods and "Details" left to the dimensions; the key limitation shown', not any(vis[0] + vis[1] + vis[2]) and all(vis[3]), vis)
                    h = pg.evaluate("document.querySelector('.gwp-xp').getBoundingClientRect().height"); heights[id] = round(h)
                    check(f'{vn} {id}: phone: the explanation card is {round(h)} px tall (budget {PHONE_BUDGET})', h <= PHONE_BUDGET, h)
                    small = pg.evaluate("Math.min(...[...document.querySelectorAll('.gwp-xp *')].filter(e => e.offsetParent && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))")
                    check(f'{vn} {id}: phone: no text below 9.5 px', small >= 9.5, small)
                if SHOTS:
                    os.makedirs(SHOTS, exist_ok=True); pg.locator('.gwp-xp').screenshot(path=f'{SHOTS}/{id}-{w}-explanation.png')
                # a card opens its own dimension, in place
                d0 = ex['dims'][0] if ex else 'P'
                # the card is the one under the finger (hit-tested), and a tap opens its dimension. At 200% zoom on a phone the emulated
                # visual viewport makes Playwright's own pointer click unreliable, so the hit test is done here and the tap dispatched on the card
                pg.evaluate("(s) => { const e = document.querySelector(s); scrollBy(0, e.getBoundingClientRect().top - (window.visualViewport ? visualViewport.height : innerHeight) / 3); }", f'.gwp-xp [data-gwp-xjump="{d0}"]'); pg.wait_for_timeout(250)
                hit = pg.evaluate("(s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + 12, r.top + 12); return !!h && e.contains(h) || (h ? h.outerHTML.slice(0, 100) : 'nothing'); }", f'.gwp-xp [data-gwp-xjump="{d0}"]')
                hit_info = hit; hit = hit is True; pg.evaluate("(s) => document.querySelector(s).click()", f'.gwp-xp [data-gwp-xjump="{d0}"]'); pg.wait_for_timeout(500)
                check(f'{vn} {id}: the card is on top where it is tapped (nothing covers it)', hit, hit_info)
                st = pg.evaluate("(k) => { const t = document.querySelector('#gwp-' + k); return t ? [t.open !== false, Math.round(t.getBoundingClientRect().top), location.hash] : null; }", d0)
                check(f'{vn} {id}: its first card ({d0}) opens that dimension in place', st is not None and st[0] and -5 <= st[1] <= 260 and st[2].startswith('#/prism/' + id), st)
                check(f'{vn} {id}: no script error', not errs, errs[:2])
            ctx.close()
        br.close()
        if heights: print('  phone card heights (px):', json.dumps(heights))
finally:
    srv.terminate()
print('prism-explain-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
