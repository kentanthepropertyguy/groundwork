"""The compact quick read on the two V1 assessment pages (Master Planning, 4 Nov 2026) in a real browser: desktop (1440), phone (390), 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-v1-quick-render.py
  LIVE=https://...  runs it against a deployed site;  REF=https://...  also compares every page's text outside the quick read with that site
  (for this release: the live V3 site, which has no quick read on these two pages);  SHOTS=dir saves screenshots.
 - Kingsford Waterbay and Hougang Central open with the compact quick read, above the approved Verdict card; its headline and figures are the renderer's
 - compact only: no What looks promising / What to watch / Before you buy; no "Explore full PRISM analysis"; no V2 card
 - the Verdict card, the Reveal, the five dimensions, sources and methodology: present, and (with REF) the same text as the reference site
 - layout: figures in one row (desktop), compact rows (phone), one column (200% zoom); nothing runs past its box; no sideways scroll;
   phone: short, no text below 9.5 px; headline and figures one navy, whatever their sign
 - "See the PRISM Verdict and evidence" moves to the Verdict card; a figure opens its dimension in place; no script error"""
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
import prism_detailed  # PRISM Research hero R1: these suites test the five dimensions, which are in Detailed
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('SHOTS'); REF = os.environ.get('REF')
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
WANT = {
    'kingsford-waterbay': ('Farther from MRT. Lower pricing. Steady market.', ['9.9% below', '1.1 km', '7.5% fewer']),
    'hougang-central': ('Close to MRT. New launch: no price evidence yet.', ['10 m', '1,149', '3.7']),
}
PHONE_BUDGET = 700   # px: the compact quick read on a 390 px phone (the V3 quick read on profile pages is 633-983 px)
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
# the page's visible text with the compact quick read taken out: the Verdict, the Reveal, the five dimensions, sources and methodology
REST = "(id) => { const p = document.querySelector('[data-gwp-page=\"' + id + '\"]').cloneNode(true); p.querySelectorAll('[data-gwp-quick]').forEach((q) => q.remove()); document.body.appendChild(p); const t = p.innerText.replace(/\\s+/g, ' ').trim(); p.remove(); return t; }"
def load(pg, base, id, compact=True):
    pg.goto(base + '/research/#/prism/' + id)
    pg.wait_for_selector(f'[data-gwp-page="{id}"] ' + ('[data-gwp-quick="compact"]' if compact else '.gwp-card'), timeout=30000); pg.wait_for_timeout(300)
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); heights = {}
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
            for id, (head0, figs0) in WANT.items():
                ref = None
                if REF:
                    try: load(pg, REF, id, compact=False); ref = pg.evaluate(REST, id)
                    except Exception as e: check(f'{vn} {id}: the reference page loads', False, e)
                try: load(pg, B, id)
                except Exception: check(f'{vn} {id}: the compact quick read loads', False, pg.url); continue
                head = re.sub(r'\s+', ' ', pg.inner_text('.gwp-qr-h')).strip()
                figs = pg.evaluate("[...document.querySelectorAll('.gwp-qr .gwp-qr-f b')].map(b => b.textContent)")
                check(f'{vn} {id}: "{head}" with {figs}', head == head0 and figs == figs0, [head, figs])
                st = pg.evaluate("""(() => { const q = document.querySelector('.gwp-qr'), c = document.querySelector('.gwp-card'), d = document.querySelector('#gwpDimsH');
                    return { above: !!c && q.getBoundingClientRect().bottom <= c.getBoundingClientRect().top && (q.compareDocumentPosition(c) & 4) > 0,
                      dims: !!d && c.getBoundingClientRect().bottom <= d.getBoundingClientRect().top, pillars: document.querySelectorAll('[data-gwp-pillar]').length,
                      n: document.querySelectorAll('.gwp-qr').length, extra: !!document.querySelector('.gwp-qr-t, .gwp-qr-q, [data-gwp-full], #gwp-full, .gwp-xp'),
                      words: /What looks promising|What to watch|Before you buy/.test(q.innerText), reveal: (document.querySelector('[data-gwp-page]').textContent.match(/PRISM Reveal/gi) || []).length,
                      verdict: !!c && /Verdict/i.test(c.textContent) && /PRISM Reveal/i.test(c.textContent) }; })()""")
                check(f'{vn} {id}: one compact quick read, above the Verdict card; the five dimensions below', st['above'] and st['dims'] and st['pillars'] == 5 and st['n'] == 1, st)
                check(f'{vn} {id}: compact only (no promising / watch / before you buy, no Explore button, no V2 card)', not st['extra'] and not st['words'], st)
                check(f'{vn} {id}: the Verdict card and the one Reveal are on the page', st['verdict'] and st['reveal'] == 1, st)
                if REF and ref is not None:
                    rest = pg.evaluate(REST, id)
                    check(f'{vn} {id}: outside the quick read, the page text is the reference page\'s ({len(rest)} characters)', rest == ref, [len(rest), len(ref)])
                tops = pg.evaluate("[...document.querySelectorAll('.gwp-qr .gwp-qr-f')].map(f => Math.round(f.getBoundingClientRect().top))")
                want = 1 if w >= 1024 else len(tops)
                check(f'{vn} {id}: {"figures in one row" if w >= 1024 else "figures as compact rows"} ({len(tops)})', len(tops) == 3 and len(set(tops)) == want, tops)
                ov = pg.evaluate("[...document.querySelectorAll('.gwp-qr, .gwp-qr *')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id}: nothing runs past its box; no sideways scroll', all(x <= 1 for x in ov) and pg.evaluate(NOOVER), max(ov) if ov else None)
                cols = pg.evaluate("[...new Set([...document.querySelectorAll('.gwp-qr .gwp-qr-f b, .gwp-qr-h')].map(b => getComputedStyle(b).color))]")
                check(f'{vn} {id}: headline and figures in the same navy, whatever their sign', cols == ['rgb(22, 33, 62)'], cols)
                if w == 390:
                    h = pg.evaluate("document.querySelector('.gwp-qr').getBoundingClientRect().height"); heights[id] = round(h)
                    check(f'{vn} {id}: phone: the compact quick read is {round(h)} px (budget {PHONE_BUDGET})', h <= PHONE_BUDGET, h)
                    small = pg.evaluate("Math.min(...[...document.querySelectorAll('.gwp-qr *')].filter(e => e.offsetParent && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize)))")
                    check(f'{vn} {id}: phone: no text below 9.5 px', small >= 9.5, small)
                if SHOTS:
                    os.makedirs(SHOTS, exist_ok=True); pg.locator('.gwp-qr').screenshot(path=f'{SHOTS}/{id}-{w}-compact.png')
                    pg.evaluate('scrollTo(0, 0)'); pg.wait_for_timeout(150); pg.screenshot(path=f'{SHOTS}/{id}-{w}-first-screen.png')
                # "See the PRISM Verdict and evidence" moves to the Verdict card
                pg.evaluate('scrollTo(0, 0)'); pg.wait_for_timeout(150)
                pg.evaluate("document.querySelector('[data-gwp-verdict]').click()"); pg.wait_for_timeout(700)
                top = pg.evaluate("Math.round(document.querySelector('.gwp-card').getBoundingClientRect().top)")
                check(f'{vn} {id}: "See the PRISM Verdict and evidence" moves to the Verdict card (top {top} px)', -5 <= top <= 300 and pg.evaluate('scrollY') > 0, top)
                # a figure opens its dimension in place
                pg.evaluate('scrollTo(0, 0)'); pg.wait_for_timeout(150)
                d0 = pg.evaluate("document.querySelector('.gwp-qr [data-gwp-xjump]').dataset.gwpXjump")
                pg.evaluate("document.querySelector('.gwp-qr [data-gwp-xjump]').click()"); pg.wait_for_timeout(600)
                st = pg.evaluate("(k) => { const t = document.querySelector('#gwp-' + k); return t ? [t.querySelector('[aria-expanded]') ? t.querySelector('[aria-expanded]').getAttribute('aria-expanded') : 'true', Math.round(t.getBoundingClientRect().top)] : null; }", d0)
                check(f'{vn} {id}: its first figure ({d0}) opens that dimension in place', st is not None and st[0] == 'true' and -5 <= st[1] <= 300, st)
                check(f'{vn} {id}: no script error', not errs, errs[:2])
            ctx.close()
        br.close()
        if heights: print('  phone compact quick-read heights (px):', json.dumps(heights))
finally:
    srv.terminate()
print('prism-v1-quick-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
