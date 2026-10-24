# python3 research/tests/consistency-render.py   One design language across the entry pages: the same heading scale, left alignment, aligned content and a compact Ken band, on desktop and at 390px.
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[2]
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(ROOT / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
ANS = json.load(open(ROOT / 'research/tests/fixtures/onemap-postal.json'))['answers']
def _search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
BASE = f'http://127.0.0.1:{P}'
passed = failed = 0
def check(name, cond, info=''):
    global passed, failed
    if cond: passed += 1; print('  ok   ' + name)
    else: failed += 1; print('  FAIL ' + name + (' :: ' + str(info) if info != '' else ''))
def opn(ctx, path):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), _search)
    pg.goto(BASE + path); pg.wait_for_timeout(700); return pg, errs
METRICS = """(() => { const h = document.querySelector('h1'), c = getComputedStyle(h), r = h.getBoundingClientRect();
  return { size: parseFloat(c.fontSize), align: c.textAlign, left: Math.round(r.left), scroll: document.documentElement.scrollWidth <= innerWidth + 1 }; })()"""
PAGES = [('Guide me', '/journey/'), ('Property values', '/journey/worth/'), ('Tools', '/tools/'), ('Budget Search', '/tools/what-can-i-buy/'), ('Mortgage', '/tools/mortgage/'), ('Homepage', '/'), ('Research', '/research/')]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw, want in (('desktop', dict(viewport={'width': 1440, 'height': 900}), 44), ('390px phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True), 32)):
        print(vn); ctx = br.new_context(**kw); left_edges = {}
        for nm, path in PAGES:
            pg, errs = opn(ctx, path); m = pg.evaluate(METRICS)
            check(f'{vn}: {nm}: the page heading is {want}px', abs(m['size'] - want) < 0.6, m)
            check(f'{vn}: {nm}: no sideways scrolling and no script errors', m['scroll'] and not errs, (m, errs[:2]))
            check(f'{vn}: {nm}: the heading is left-aligned', m['align'] in ('left', 'start'), m)
            left_edges[nm] = m['left']; pg.close()
        # the content below a heading starts where the heading starts
        for nm, path, sel in (('Guide me', '/journey/', '.gw-paths a'), ('Property values', '/journey/worth/', '[data-vx-pc] input, .gw-vx-pc input'), ('Tools', '/tools/', '.gw-tl'), ('Research', '/research/', '#q')):
            pg, errs = opn(ctx, path); l = pg.evaluate("(s) => { const e = [...document.querySelectorAll(s)].find(x => x.getBoundingClientRect().width > 0); return e ? Math.round(e.getBoundingClientRect().left) : null }", sel)
            check(f'{vn}: {nm}: the content lines up with the heading', l is not None and abs(l - left_edges[nm]) <= 2, (l, left_edges[nm])); pg.close()
        # the Ken band is a compact strip, not a section of its own
        for nm, path in (('Guide me', '/journey/'), ('Property values', '/journey/worth/'), ('Tools', '/tools/')):
            pg, errs = opn(ctx, path); h = pg.evaluate("document.querySelector('.gw-ken').getBoundingClientRect().height")
            check(f'{vn}: {nm}: the Ken band is compact ({round(h)}px)', h <= (230 if vn == 'desktop' else 330), h)
            check(f'{vn}: {nm}: it does not repeat the licence and LIVE lines the footer already carries', pg.locator('.gw-ken .gw-onlive').count() == 0 and pg.locator('.gw-ken .gw-live').count() == 0 and pg.locator('.gw-foot .gw-live, .gw-foot .live, .gw-foot [class*=live]').count() >= 1)
            pg.close()
        # Property values & market prices: a compact heading and the search straight away, nothing lost
        pg, errs = opn(ctx, '/journey/worth/')
        lead = pg.inner_text('.gw-hero .gw-lead'); fld = pg.evaluate("(() => { const i = document.querySelector('[data-vx-pc]'), c = getComputedStyle(i); return { r: c.borderRadius, h: i.getBoundingClientRect().height, top: i.getBoundingClientRect().top } })()")
        check(f'{vn}: Property values: a one-sentence introduction ({len(lead)} characters)', len(lead) <= 130, lead)
        check(f'{vn}: Property values: the postal-code field is on the first screen and styled like the other forms (12px corners)', fld['r'] == '12px' and fld['top'] < (700 if vn == 'desktop' else 560), fld)
        box = pg.evaluate("(() => { const e = document.querySelector('.gw-vx'), c = getComputedStyle(e); return { b: c.borderTopWidth, p: c.paddingTop } })()")
        check(f'{vn}: Property values: the entry is the search itself, not a boxed card', box['b'] == '0px' and box['p'] == '0px', box)
        check(f'{vn}: Property values: HDB, condo and landed choices are all still there', all(pg.locator(f'[data-vx-type={t}]').count() == 1 for t in ('hdb', 'condo', 'landed')))
        pg.fill('[data-vx-pc]', '570155'); pg.wait_for_function("document.querySelector('[data-vx-pcout]').innerText.trim().length > 0", timeout=8000)
        check(f'{vn}: Property values: a postal code is still looked up', 'BISHAN' in pg.inner_text('[data-vx-pcout]').upper() or '570155' in pg.inner_text('[data-vx-pcout]'), pg.inner_text('[data-vx-pcout]')[:120])
        pg.close(); ctx.close()
    br.close()
finally:
    srv.terminate()
print(f'\n{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
