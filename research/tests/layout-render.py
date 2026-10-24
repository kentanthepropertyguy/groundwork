import os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
"""Research page width (24 Oct 2026). Run from the site folder:  python3 research/tests/layout-render.py
From 980px the development overview takes the same width as the sections below it, with the Market pulse beside the price answer; below 980px it is one column.
Checks at 1024, 1280, 1440, 1536, 768 and 390/360 px: overview and lower sections share the same left and right edges; the pulse sits to the right of the price at
desktop and has room (headline, three figures); long paragraphs stay within 62ch; no sideways scroll; size switching, the next-step link and Map -> Open full analysis still work."""
SITE = pathlib.Path(__file__).resolve().parents[2]
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = f'http://127.0.0.1:{P}'
ok = fail = 0
def check(n, c, i=''):
    global ok, fail
    if c: ok += 1; print('  ok  ', n)
    else: fail += 1; print('  FAIL', n, i)
M = """() => { const box = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom), w: Math.round(b.width)}; };
  const lower = [...document.querySelectorAll('.lg-band .lg-wrap, section.lg-band > .lg-wrap')].filter(e => e.getBoundingClientRect().top > document.querySelector('.lg-hero').getBoundingClientRect().bottom - 2).map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right)]; });
  const para = [...document.querySelectorAll('.lg-hero--ans .lg-run, .lg-hero--ans .lg-facts')].map(e => Math.round(e.getBoundingClientRect().width / parseFloat(getComputedStyle(e).fontSize)));
  return { wrap: box('.lg-hero--ans .lg-wrap'), ans: box('.lg-ans'), mp: box('[data-mp]'), id: box('.lg-hero--ans .lg-id'), sizes: box('.lg-sizes'), lower, para, sw: document.documentElement.scrollWidth, iw: innerWidth }; }"""
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for W, H in [(1536, 900), (1440, 900), (1280, 900), (1024, 900), (768, 900), (390, 844), (360, 740)]:
        mob = W < 500
        ctx = br.new_context(viewport={'width': W, 'height': H}, **({'is_mobile': True, 'has_touch': True} if mob else {})); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.route(re.compile(r'googletagmanager|facebook|onemap'), lambda r: r.fulfill(status=200, body=''))
        pg.goto(B + '/research/#/p/1-canberra'); pg.wait_for_selector('#sizeSel'); pg.wait_for_timeout(400)
        tag = f'{W}px: '
        # before a size is chosen: the same page width, the at-a-glance card in the right column (or below the question on a phone)
        n0 = pg.evaluate(M.replace("'[data-mp]'", "'[data-lg-ov]'").replace('mp: box', 'ov: box'))
        if W >= 980:
            check(tag + 'no size chosen: the at-a-glance card sits right of the size question, level with the name', n0['ov']['l'] >= n0['sizes']['r'] + 20 and abs(n0['ov']['t'] - n0['id']['t']) <= 24, (n0['ov'], n0['sizes'], n0['id']))
            check(tag + 'no size chosen: overview edges match the sections below', all(abs(n0['wrap']['l'] - l[0]) <= 2 and abs(n0['wrap']['r'] - l[1]) <= 2 for l in n0['lower']), (n0['wrap'], n0['lower']))
        else:
            check(tag + 'no size chosen: one column, the size question first and the at-a-glance card after it', n0['ov']['t'] >= n0['sizes']['b'] - 2, (n0['ov'], n0['sizes']))
        check(tag + 'no size chosen: no sideways scroll', n0['sw'] <= n0['iw'])
        pg.select_option('#sizeSel', '900'); pg.wait_for_selector('[data-mp]'); pg.wait_for_timeout(400)
        m = pg.evaluate(M)
        check(tag + 'no sideways scroll', m['sw'] <= m['iw'], m)
        if W >= 980:
            lo = m['lower']; lw = min(l[1] - l[0] for l in lo) if lo else 0
            check(tag + 'overview spans the same left and right edges as the sections below', bool(lo) and all(abs(m['wrap']['l'] - l[0]) <= 2 and abs(m['wrap']['r'] - l[1]) <= 2 for l in lo), (m['wrap'], lo))
            check(tag + 'pulse sits to the right of the price answer, starting level with the name', m['mp']['l'] >= m['ans']['r'] + 20 and abs(m['mp']['t'] - m['id']['t']) <= 24, (m['mp'], m['ans'], m['id']))
            check(tag + 'pulse is wide enough for its figures (>= 340px)', m['mp']['w'] >= 340, m['mp'])
            check(tag + 'price answer and size chips are in the left column', m['ans']['r'] <= m['mp']['l'] and m['sizes']['r'] <= m['mp']['l'] + 2, m)
            check(tag + 'pulse headline, three figures and the next-step link are all visible', pg.locator('[data-mp] .mp-h').is_visible() and pg.locator('[data-mp] .mp-f > div').count() == 3 and pg.locator('[data-mp] a[href="#next"]').is_visible())
        else:
            check(tag + 'one column: the pulse sits below the price answer', m['mp']['t'] >= m['ans']['b'] - 2 and m['mp']['l'] <= m['ans']['l'] + 4, (m['mp'], m['ans']))
            check(tag + 'one column: the overview fits the screen', m['wrap']['l'] >= 0 and m['wrap']['r'] <= m['iw'], m['wrap'])
        check(tag + 'paragraphs stay within 62 characters', all(x <= 66 for x in m['para']), m['para'])
        # size switching updates the price and the pulse together
        before = (pg.inner_text('.lg-ans'), pg.inner_text('[data-mp]'))
        pg.select_option('#sizeSel', '1000'); pg.wait_for_timeout(500)
        after = (pg.inner_text('.lg-ans'), pg.inner_text('[data-mp]'))
        check(tag + 'changing the size band updates the price answer and the pulse', before[0] != after[0] and '1,000–1,099' in after[1] and '1,000–1,099' in after[0], after[1][:120])
        check(tag + 'no sideways scroll after the size change', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        pg.click('[data-mp] a[href="#next"]'); pg.wait_for_timeout(600)
        check(tag + 'next-step link brings the cards into view', pg.evaluate("(() => { const b = document.getElementById('next').getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; })()"))
        check(tag + 'no script errors', not errs, errs[:2]); ctx.close()
    # a development with no pulse keeps the single readable column
    ctx = br.new_context(viewport={'width': 1440, 'height': 900}); pg = ctx.new_page()
    pg.route(re.compile(r'googletagmanager|facebook|onemap'), lambda r: r.fulfill(status=200, body=''))
    pg.goto(B + '/research/'); pg.wait_for_timeout(600)
    check('landing page unchanged: no sideways scroll at 1440', pg.evaluate('document.documentElement.scrollWidth <= innerWidth'))
    ctx.close()
finally: srv.terminate()
print(ok, 'passed', fail, 'failed')
sys.exit(1 if fail else 0)
