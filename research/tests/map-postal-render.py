# Map: a postal code that is exactly one development opens that development's panel (Ken, 29 Oct 2026). Desktop 1440 and phone 390.
#   python3 research/tests/map-postal-render.py
# OneMap is stubbed with real answers saved in fixtures/onemap-postal.json, so it needs no internet. Cases: Bartley Ridge 368060 (search and a
# shared link), other blocks of multi-block developments, HDB blocks (unchanged), a near name, a non-residential building, an unknown code.
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
ANS = json.load(open(SITE / 'research/tests/fixtures/onemap-postal.json'))['answers']
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok_n = fail_n = 0
def ok(c, name, info=''):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('  FAIL', name, str(info)[:300])
def search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
def fresh(br, kw):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'onemap' not in m.text.lower() else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), search)
    return ctx, pg, errs
def open_map(pg, h=''):
    pg.goto(B + '/research/map/' + h); pg.wait_for_function('window.KPT_MAP_APP && window.KPT_MAP_APP.evReady', timeout=20000)
def card(pg):   # what the panel is: ['dev', name] | ['place', aria-label, title] | ['none']
    pg.wait_for_timeout(900)
    return pg.evaluate("""() => { const a = document.querySelector('aside.dp, aside.bs'); if (!a) return ['none']; const h = a.querySelector('h2'), l = a.getAttribute('aria-label') || '';
      return l === 'Selected development' ? ['dev', h ? h.innerText.trim() : ''] : ['place', l, h ? h.innerText.trim() : '', !!a.querySelector('[data-hdb-panel]')]; }""")
def pick(pg, code):
    pg.fill('#q', code); pg.wait_for_selector('.sugg button[data-pick^="postal"]', timeout=15000); pg.click('.sugg button[data-pick^="postal"]')
def hash_(pg): return pg.evaluate('decodeURIComponent(location.hash)')
DEV = [('368060', 'Bartley Ridge', 'bartley-ridge'), ('368055', 'Bartley Ridge', 'bartley-ridge'), ('368063', 'Bartley Ridge', 'bartley-ridge'), ('528482', 'Treasure At Tampines', 'treasure-at-tampines'),
       ('545021', 'Kovan Melody', 'kovan-melody'), ('548189', 'Kovan Melody', 'kovan-melody'), ('018986', 'The Sail @ Marina Bay', 'the-sail-at-marina-bay'), ('399941', 'Waterbank At Dakota', 'waterbank-at-dakota'),
       ('575749', 'Jadescape', 'jadescape'), ('579819', 'Bishan Loft', 'bishan-loft'), ('359419', 'Dunsfold 18', 'dunsfold-18')]
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            # 1. Bartley Ridge 368060 from the search box: its development panel, the development in the address, Back returns to where the visitor was
            ctx, pg, errs = fresh(br, kw); open_map(pg)
            h0 = hash_(pg); pick(pg, '368060'); pg.wait_for_selector('aside[aria-label="Selected development"] h2', timeout=20000)
            c = card(pg); ok(c[0] == 'dev' and c[1].lower() == 'bartley ridge', vn + ': 368060 opens Bartley Ridge’s development panel', c)
            ok(hash_(pg).startswith('#p=bartley-ridge') and '368060' not in pg.url, vn + ': the address is the development’s, not the postal code', hash_(pg))
            ok(pg.locator('[data-lead="beds"]').count() == 1 and pg.locator('aside [data-m-full]').count() == 1, vn + ': with its prices and View Full Research')
            pg.go_back(); pg.wait_for_timeout(900)
            ok(hash_(pg) == h0, vn + ': Back returns to the Map as it was before the search', (hash_(pg), h0))
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
            # 2. the same as a shared link to the postal code, and other blocks of multi-block developments
            for code, name, did in DEV:
                ctx, pg, errs = fresh(br, kw); open_map(pg, '#pl=postal:' + code)
                try: pg.wait_for_selector('aside[aria-label="Selected development"] h2', timeout=20000)
                except Exception: pass
                c = card(pg)
                ok(c[0] == 'dev' and c[1].lower() == name.lower() and hash_(pg).startswith('#p=' + did), vn + ': link to postal code ' + code + ' opens ' + name, (c, hash_(pg)))
                ok(not errs, vn + ': ' + code + ' no script errors', errs[:2]); ctx.close()
            # 3. HDB blocks: as before (the block's resale prices in the postal-code panel)
            for code in ['550500', '570155']:
                ctx, pg, errs = fresh(br, kw); open_map(pg); pick(pg, code)
                pg.wait_for_selector('[data-hdb-panel=ok]', timeout=20000); c = card(pg)
                ok(c[0] == 'place' and c[3] and hash_(pg).startswith('#pl=postal:' + code), vn + ': HDB ' + code + ' keeps the HDB block panel', (c, hash_(pg)))
                ok(not errs, vn + ': ' + code + ' no script errors', errs[:2]); ctx.close()
            # 4. no exact development: the postal-code panel with what is nearby (never the nearest development)
            for code, why in [('459007', 'a near name only (United Mansions)'), ('238801', 'a non-residential building (ION Orchard)'), ('569933', 'a mall (AMK Hub)')]:
                ctx, pg, errs = fresh(br, kw); open_map(pg); pick(pg, code); pg.wait_for_timeout(1500); c = card(pg)
                ok(c[0] == 'place' and hash_(pg).startswith('#pl=postal:' + code), vn + ': ' + code + ', ' + why + ': the postal-code panel', (c, hash_(pg)))
                ok(not errs, vn + ': ' + code + ' no script errors', errs[:2]); ctx.close()
            ctx, pg, errs = fresh(br, kw); open_map(pg, '#pl=postal:456789'); pg.wait_for_timeout(2000); c = card(pg)
            ok(c[0] == 'place' and 'No address found' in pg.inner_text('aside'), vn + ': an unknown postal code is said plainly', (c, pg.inner_text('aside')[:120]))
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('map-postal-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
