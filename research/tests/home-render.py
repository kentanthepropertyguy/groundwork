"""Homepage V1.1 (Master Planning, 6 Nov 2026): the hero's map preview in a real browser at 1440, 1024 (desktop), 390 and 360 (phones).
Run from the site folder:  python3 research/tests/home-render.py
OneMap is not called: tiles and the logo are answered locally, and every tile the page asks for is counted.
 1 desktop: title, search, three developments and the selected one's figures on the left, the map on the right, all in the first screen
   phone: title, search, developments, map, figures, then the journey cards
 2 the figures are GW_HOME.view() of data/map/home.json (the Map's own), the Research and Map links follow the selection
 3 chips, map pins and the keyboard all select; aria-pressed and the live region follow; the map moves to the development
 4 tiles: only those the view needs (zoom 14 / 256 px; zoom 15 Default_HD at 128 px on a dense screen); OneMap's logo and attribution shown
 5 reduced motion: no pulse, no slide; no data: the preview steps aside and the page still works; no tiles: said, figures kept
 6 kept: the three journeys, the search (its results hide the chips), links, calculators; "TikTok Live every night" in the footer
Throughout: no script error, no sideways scroll."""
import json, os, re, socket, subprocess, base64
from playwright.sync_api import sync_playwright
SITE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:400] if info != '' else ''))
def serve(folder):
    s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
    p = subprocess.Popen(['node', os.path.join(folder, 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    import time
    for _ in range(200):
        try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
        except OSError: time.sleep(0.05)
    return p, f'http://127.0.0.1:{P}'
srv, B = serve(SITE)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
DOC = json.load(open(os.path.join(SITE, 'data/map/home.json')))
BOX = "(s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height, b: r.bottom + scrollY, top: r.top, bot: r.bottom }; }"
def page(ctx, errs, tiles=None, data=True, tile_ok=True):
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
    def onemap(r):
        u = r.request.url
        if '/maps/tiles/' in u:
            if tiles is not None: tiles.append(u)
            return r.fulfill(status=200, body=PNG, content_type='image/png') if tile_ok else r.abort()
        return r.fulfill(status=200, body=PNG, content_type='image/png')
    pg.route(re.compile(r'onemap\.gov\.sg'), onemap)
    if not data: pg.route(re.compile(r'data/map/home\.json'), lambda r: r.fulfill(status=404, body='no'))
    pg.goto(B + '/'); return pg
def ready(pg): pg.wait_for_selector('[data-gh-psf]', timeout=10000); pg.wait_for_function("document.querySelector('[data-gh-map]').getAttribute('data-tiles') === 'loaded'", timeout=10000)
def want(pg, i): return pg.evaluate("(i) => fetch('data/map/home.json').then((x) => x.json()).then((d) => GW_HOME.view(d.featured[i], d, ''))", i)
def panel(pg): return pg.evaluate("() => ({ n: document.querySelector('.gh-n').textContent, meta: document.querySelector('.gh-meta').textContent, psf: (document.querySelector('[data-gh-psf]') || {}).textContent, count: document.querySelector('[data-gh-count]').textContent, hint: document.querySelector('[data-gh-hint]').textContent, research: document.querySelector('[data-gh-research]').getAttribute('href'), open: document.querySelector('[data-gh-open]').getAttribute('href') })")
def same(pg, i):
    v, p = want(pg, i), panel(pg)
    return p['n'] == v['name'] and p['meta'] == v['meta'] and p['psf'] == v['psf'] and p['count'] == str(v['count']) and p['hint'] == v['hint'] and p['research'] == v['research'] and p['open'] == v['map'], [p, v]
def pressed(pg): return pg.eval_on_selector_all('[data-gh-chips] [data-gh-id]', 'bs => bs.map((b) => b.getAttribute("aria-pressed"))')
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('1440', dict(viewport={'width': 1440, 'height': 900})), ('1024', dict(viewport={'width': 1024, 'height': 768})),
                       ('390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('360', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, device_scale_factor=3))]:
            phone = int(vn) < 500; ctx = br.new_context(**kw); errs = []; tiles = []
            pg = page(ctx, errs, tiles); ready(pg)
            # 1 layout
            m, pv, h1, sx, ch, d = (pg.evaluate(BOX, s) for s in ('[data-gh-map]', '[data-gh-pv]', '.gw-home h1', '[data-gw-search="home"] .gw-sx-box', '[data-gh-chips]', '.gw-doors3'))
            vh = kw['viewport']['height']
            if not phone:
                check(f'{vn} 1 desktop: the map on the right, beside the title, search, developments and figures', m['x'] > pv['x'] + pv['w'] - 1 and m['top'] < 140 and abs(m['b'] - pv['b']) < 60, [m, pv])
                check(f'{vn} 1 ... all in the first screen (map {int(m["top"])}–{int(m["bot"])} px; figures to {int(pv["bot"])} px)', m['bot'] <= vh and pv['bot'] <= vh, [m, pv])
                check(f'{vn} 1 ... the three developments on one row', len(set(round(b['y']) for b in pg.evaluate("[...document.querySelectorAll('[data-gh-chips] button')].map((b) => ({ y: b.getBoundingClientRect().top }))"))) == 1)
            else:
                check(f'{vn} 1 phone: title, search, developments, map, figures, then the journeys', h1['y'] < sx['y'] < ch['y'] < m['y'] < pv['y'] < d['y'], [h1['y'], sx['y'], ch['y'], m['y'], pv['y'], d['y']])
                check(f'{vn} 1 ... the map is full width and starts in the first screen', abs(m['w'] - (kw['viewport']['width'] - 32)) <= 2 and m['top'] < vh, m)
            # 2 figures
            check(f'{vn} 2 on load: the first development selected, its figures from home.json (the Map\'s)', pressed(pg) == ['true', 'false', 'false'] and same(pg, 0)[0], same(pg, 0)[1])
            check(f'{vn} 2 ... its pin and its label on the map', pg.locator('.gh-pin.on').count() == 1 and pg.locator('.gh-pin.on').get_attribute('data-gh-id') == DOC['featured'][0]['id'] and pg.locator('.gh-lbl.on').count() == 1)
            ctr = pg.evaluate("() => { const m = document.querySelector('[data-gh-map]').getBoundingClientRect(), p = document.querySelector('.gh-pin.on').getBoundingClientRect(); return [p.left + p.width / 2 - m.left - m.width / 2, p.top + p.height / 2 - m.top - m.height / 2]; }")
            check(f'{vn} 2 ... centred on the map', abs(ctr[0]) <= 3 and abs(ctr[1]) <= 3, ctr)
            big = pg.evaluate("Math.max(...[...document.querySelectorAll('.gh-pin, .gh-dot, .gh-tiles img')].map((e) => Math.max(Math.abs(parseFloat(e.style.left)), Math.abs(parseFloat(e.style.top)))))")
            check(f'{vn} 2 ... marks and tiles placed in local pixels (largest offset {int(big)} px), so round marks stay round', big < 20000, big)
            # 4 tiles and attribution
            hd = phone
            n = len(tiles); exp = pg.evaluate("(a) => GW_HOME.tilesFor(GW_HOME.proj(a[0], a[1]), a[2], a[3], a[4]).length", [DOC['featured'][0]['lat'], DOC['featured'][0]['lon'], m['w'], m['h'], hd])
            check(f'{vn} 4 tiles: {n} asked for, exactly what the view needs', n == exp, [n, exp])
            check(f'{vn} 4 ... ' + ('zoom 15 Default_HD at 128 px (dense screen)' if hd else 'zoom 14 Default at 256 px'), all(('/Default_HD/15/' in u) if hd else ('/Default/14/' in u) for u in tiles) and pg.evaluate("[...document.querySelectorAll('.gh-tiles img')].every((i) => i.style.width === '" + ('128px' if hd else '256px') + "')"), tiles[:2])
            at = pg.evaluate("() => { const a = document.querySelector('.gh-attr'), m = document.querySelector('[data-gh-map]').getBoundingClientRect(), r = a.getBoundingClientRect(), i = a.querySelector('img'); return { t: a.innerText.replace(/\\s+/g, ' ').trim(), links: [...a.querySelectorAll('a')].map((x) => x.href), inside: r.left >= m.left && r.right <= m.right && r.bottom <= m.bottom, img: i && i.getAttribute('src'), iw: i && i.getBoundingClientRect().width, vis: getComputedStyle(a).visibility, z: +getComputedStyle(a).zIndex }; }")
            check(f'{vn} 4 OneMap\'s logo and "OneMap © contributors | Singapore Land Authority", both linked, inside the map', at['t'] == 'OneMap © contributors | Singapore Land Authority' and at['links'] == ['https://www.onemap.gov.sg/', 'https://www.sla.gov.sg/'] and at['inside'] and at['img'].endswith('/om_logo.png') and at['iw'] == 20 and at['vis'] == 'visible', at)
            # 3 selecting
            pg.locator('.gh-pin[data-gh-id="%s"]' % DOC['featured'][2]['id']).click(); pg.wait_for_function("(n) => document.querySelector('.gh-n').textContent === n", arg=DOC['featured'][2]['name'])
            check(f'{vn} 3 a pin on the map (a development in view) selects it', pressed(pg) == ['false', 'false', 'true'] and same(pg, 2)[0], same(pg, 2)[1])
            pg.locator('[data-gh-chips] [data-gh-id="%s"]' % DOC['featured'][1]['id']).click(); pg.wait_for_function("(n) => document.querySelector('.gh-n') && document.querySelector('.gh-n').textContent === n", arg=DOC['featured'][1]['name'])
            check(f'{vn} 3 a chip: the development selected, its figures, its links; aria-pressed follows', pressed(pg) == ['false', 'true', 'false'] and same(pg, 1)[0] and pg.locator('.gh-pin.on').get_attribute('aria-pressed') == 'true', same(pg, 1)[1])
            check(f'{vn} 3 the panel is a polite live region; the map pins are pointer-only (out of the tab order; the chips are the keyboard and screen-reader way)', pg.get_attribute('[data-gh-pv]', 'aria-live') == 'polite' and pg.evaluate("[...document.querySelectorAll('.gh-pin')].every((b) => b.tagName === 'BUTTON' && b.tabIndex === -1) && document.querySelector('.gh-pins').getAttribute('aria-hidden') === 'true'"))
            if not phone:
                pg.focus('[data-gh-chips] [data-gh-id="%s"]' % DOC['featured'][0]['id']); pg.keyboard.press('Enter'); pg.wait_for_function("(n) => document.querySelector('.gh-n').textContent === n", arg=DOC['featured'][0]['name'])
                check(f'{vn} 3 the keyboard selects (Enter on a chip), focus shown', pressed(pg) == ['true', 'false', 'false'] and pg.evaluate("getComputedStyle(document.activeElement, null).outlineStyle") != 'none')
            new = len(tiles); check(f'{vn} 4 moving to another development asks only for the new tiles ({new - n} more)', len(set(tiles)) == new and new - n <= 3 * exp, [n, new])
            # 6 kept
            check(f'{vn} 6 kept: the three journeys, the links, the calculators line, the sample report', pg.locator('.gw-door3').count() == 3 and pg.locator('.gw-doors-more a').count() == 3 and pg.locator('.gw-allt a').count() == 5)
            ft = pg.inner_text('.gw-foot')
            check(f'{vn} 6 footer: "TikTok Live every night", no hours; Ken\'s photo, name and credentials kept', 'TikTok Live every night · @kennx8898' in ft and '9.30' not in ft and pg.locator('.gw-foot img[src*="ken-portrait"]').count() == 1 and 'CEA R007903D' in ft and 'Property agent since 2007' in ft)
            inp = pg.locator('[data-gw-search="home"] input'); inp.fill('Jadescape'); pg.wait_for_selector('[data-gw-search="home"] .gw-sx-res:not([hidden]) [role=option], [data-gw-search="home"] .gw-sx-res:not([hidden]) a', timeout=8000)
            check(f'{vn} 6 the search still works; while its results show, the developments row steps aside', not pg.locator('[data-gh-chips]').is_visible())
            inp.fill(''); pg.keyboard.press('Escape')
            check(f'{vn} no sideways scroll', pg.evaluate(NOOVER))
            check(f'{vn} no script error', not errs, errs[:3])
            ctx.close()
            # 5 reduced motion, no data, no tiles
            ctx = br.new_context(reduced_motion='reduce', **kw); errs = []; pg = page(ctx, errs); ready(pg)
            mo = pg.evaluate("() => ({ pulse: getComputedStyle(document.querySelector('.gh-pin.on'), '::before').animationName, slide: getComputedStyle(document.querySelector('.gh-tiles')).transitionDuration, entry: getComputedStyle(document.querySelector('[data-gh-map]')).animationName })")
            check(f'{vn} 5 reduced motion: no pulse, no slide, no entry animation', mo['pulse'] == 'none' and mo['slide'] == '0s' and mo['entry'] == 'none', mo)
            pg.locator('[data-gh-chips] [data-gh-id="%s"]' % DOC['featured'][1]['id']).click()
            check(f'{vn} 5 ... and the figures change at once', pg.inner_text('.gh-n') == DOC['featured'][1]['name'])
            ctx.close()
            ctx = br.new_context(**kw); errs = []; pg = page(ctx, errs, data=False); pg.wait_for_selector('.gw-home.gh-off', timeout=8000)
            check(f'{vn} 5 no data: the map steps aside, a way to the Map instead; the journeys and search remain', not pg.locator('[data-gh-map]').is_visible() and pg.locator('[data-gh-pv] a[href="research/map/"]').count() == 1 and pg.locator('.gw-door3').count() == 3 and pg.locator('[data-gw-search="home"] input').is_visible() and not errs, errs)
            ctx.close()
            ctx = br.new_context(**kw); errs = []; pg = page(ctx, errs, tile_ok=False); pg.wait_for_function("document.querySelector('[data-gh-map]') && document.querySelector('[data-gh-map]').getAttribute('data-tiles') === 'failed'", timeout=15000)
            check(f'{vn} 5 no tiles: the map says so; the figures and links stay', pg.locator('[data-gh-psf]').count() == 1 and pg.locator('[data-gh-open]').is_visible())
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'home-render: {ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
