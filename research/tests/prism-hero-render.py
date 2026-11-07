"""PRISM Research hero, Release 1 (Master Planning, 7 Nov 2026) in a real browser: desktop (1440), phone (390, 360) and 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-hero-render.py   (LIVE=https://... against a deployed site; SHOTS=dir for screenshots)
OneMap is answered locally (a 1 px tile), so the test counts tile requests without the network.
 - the hero, the strip, the pentagon and Simple / Detailed on full, partial and limited pages; the two V1 Verdict pages unchanged
 - the opening and every figure are the renderer's own; the quick read's headline and figures are not shown twice
 - Simple hides the section bar, the full analysis and the five dimensions; Detailed shows them exactly as before; a figure, a corner or a
   dimension link opens Detailed at that dimension; the choice is remembered
 - OneMap's attribution: logo and both links, on the map and never covered; tile budgets; nothing still moving after 5 s
 - reduced motion: the final frame at once, one tile layer, no animation
 - no position (Map data missing) or no tiles: the page keeps everything else; no sideways scroll, no script errors"""
import base64, json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
SHOTS = os.environ.get('SHOTS')
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:500] if info else ''))
s = socket.socket(); s.bind(('127.0.0.1', 0)); P = s.getsockname()[1]; s.close()
srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
# full (4 figures), quiet Reveal, partial (no price), limited (no price or resale: 2 figures), settling, no market change, a Reveal page
# with no strip, the future-MRT pilot, and the two V1 Verdict pages (no hero)
CASES = ['thomson-three', 'bartley-ridge', 'alba', '8-raja', 'myra', 'forest-hills-condominium', 'hong-heng-garden', 'belysa', 'hundred-palms-residences']
V1 = ['kingsford-waterbay', 'hougang-central']
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
EXPECT = """(id) => { const G = GW_PRISM, X = GW_PRISMHERO, md = G._settled[id]; if (!md) return null; const op = X.openingOf(G, md); if (!op) return { none: true };
  return { head: op.head, figs: X.stripOf(op).map((f) => [f.v, f.unit]), corners: X.cornersOf(G, md, op).map((c) => [c.key, c.state, c.word]) }; }"""
STATE = """() => { const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const h = document.querySelector('[data-gph]'), pg = document.querySelector('.gwp-page'), a = document.querySelector('[data-gph-attr]');
  let attr = null; if (a && vis(a)) { const r = a.getBoundingClientRect(), pts = [[r.left + 4, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 4, r.top + r.height / 2]];
    const hr = h.querySelector('[data-gph-map]').getBoundingClientRect();
    attr = { t: a.textContent.replace(/\\s+/g, ' ').trim(), links: [...a.querySelectorAll('a')].map((x) => x.href), img: (a.querySelector('img') || {}).src || '',
      top: pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); return e && a.contains(e); }), inside: r.left >= hr.left && r.right <= hr.right && r.top >= hr.top && r.bottom <= hr.bottom }; }
  const figs = [...document.querySelectorAll('[data-gph-fig]')].map((f) => ({ v: (f.querySelector('.gph-fv') || {}).textContent, u: (f.querySelector('.gph-fu') || {}).textContent, vis: vis(f), bottom: f.querySelector('.gph-fu').getBoundingClientRect().bottom + scrollY, cmp: vis(f.querySelector('[data-gph-cmp]')) || !f.querySelector('[data-gph-cmp]'), fs: parseFloat(getComputedStyle(f.querySelector('.gph-fv')).fontSize) }));
  return { hero: !!h, mode: pg && pg.getAttribute('data-gph-mode'), head: (document.querySelector('.gph-h') || {}).textContent || '', headVis: vis(document.querySelector('.gph-h')),
    h1InHero: !!(h && h.querySelector('.gwp-h1')), figs, attr,
    corners: [...document.querySelectorAll('[data-gph-corner]')].map((c) => [c.dataset.gphCorner, c.dataset.gphState]),
    dims: vis(document.querySelector('.gwp-dims')), bar: vis(document.querySelector('[data-gwp-bar]')), full: vis(document.querySelector('[data-gwp-full]')), glance: vis(document.querySelector('[data-gph-glance]')),
    warnAfter: (() => { const wn = document.querySelector('[data-gwp-warn]'), sp = document.querySelector('[data-gph-strip]'); return !wn || !sp || (vis(wn) && wn.getBoundingClientRect().top >= sp.getBoundingClientRect().bottom - 1 && !!wn.closest('.gph-box')); })(),
    qrHead: vis(document.querySelector('.gwp-qr-h')), qrFigs: vis(document.querySelector('.gwp-qr-fs')), warn: vis(document.querySelector('.gwp-qr-w')), sources: vis(document.querySelector('[data-gwp-sources]')),
    tabs: vis(document.querySelector('[data-gwp-switch]')), acts: vis(document.querySelector('[data-gwp-calc]')), deco: vis(document.querySelector('.gwp-hero')),
    flight: h && h.querySelector('[data-gph-map]').getAttribute('data-flight'), tiles: h && h.querySelector('[data-gph-map]').getAttribute('data-tiles'), l14: document.querySelectorAll('[data-gph-l="14"] img').length,
    plain: !!(h && h.classList.contains('gph--plain')), note: vis(document.querySelector('[data-gph-note]')), noover: document.documentElement.scrollWidth <= innerWidth + 1,
    running: document.getAnimations().filter((x) => x.playState === 'running' && x.effect && x.effect.target && x.effect.target.closest && x.effect.target.closest('.gph-box')).length };
}"""
def ready(pg, i):
    pg.wait_for_function(f"() => !!document.querySelector('.gwp-page[data-gwp-page=\"{i}\"]')", timeout=30000)
    pg.wait_for_timeout(150)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def ctx_for(w, rm=False, tiles=True, places=True, mode=None):
            mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 360: 740, 195: 422}[w]}, is_mobile=mob, has_touch=mob, reduced_motion='reduce' if rm else 'no-preference')
            if mode: ctx.add_init_script(f"try{{localStorage.setItem('gw.prism.mode','{mode}')}}catch(e){{}}")
            n = {'t': 0}
            def onemap(r):
                if '/maps/tiles/' in r.request.url: n['t'] += 1
                return r.fulfill(status=200, body=PNG, content_type='image/png') if tiles or '/maps/tiles/' not in r.request.url else r.abort()
            ctx.route(re.compile(r'onemap\.gov\.sg'), onemap)
            ctx.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
            if not places: ctx.route(re.compile(r'data/map/places\.json'), lambda r: r.fulfill(status=404, body='no'))
            return ctx, n
        for w in [1440, 390, 360, 195]:
            vn = f'{w}px'; cases = CASES if w in (1440, 390) else ['thomson-three', '8-raja', 'hong-heng-garden']
            ctx, n = ctx_for(w); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
            for i in cases:
                n['t'] = 0
                pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); ready(pg, i)
                ex = pg.evaluate(EXPECT, i); pg.wait_for_timeout(5000); st = pg.evaluate(STATE)
                if SHOTS: pathlib.Path(SHOTS).mkdir(parents=True, exist_ok=True); pg.screenshot(path=f'{SHOTS}/hero-{i}-{w}.png')
                t = f'{vn} {i}:'
                check(f'{t} the hero is there, with the name inside it, and Simple by default', st['hero'] and st['h1InHero'] and st['mode'] == 'simple', st)
                check(f'{t} the opening is the page\'s own approved opening, word for word, and visible', st['head'] == ex['head'] and st['headVis'], [st['head'], ex['head']])
                check(f'{t} the strip shows exactly the renderer\'s figures ({len(ex["figs"])})', [[f['v'], f['u']] for f in st['figs']] == ex['figs'] and all(f['vis'] for f in st['figs']), [st['figs'], ex['figs']])
                check(f'{t} the pentagon: P, R, I, S, M with their states', [c[:2] for c in ex['corners']] == st['corners'] and st['glance'], [st['corners'], ex['corners']])
                if i == 'myra':   # an initial resale wave (Claude C data sign-off, 7 Nov 2026): settling is fact only, never a compared marker
                    rv = pg.evaluate("(() => { const g = document.querySelectorAll('.gph-pg .gph-vx')[1]; const row = document.querySelector('[data-gph-corner=\"R\"]'); return { state: row.dataset.gphState, word: row.querySelector('.gph-rw').textContent, fact: !!g.querySelector('.gph-mk--fact'), cmp: !!g.querySelector('.gph-mk--cmp'), halo: !!g.querySelector('.gph-halo'), leg: row.querySelector('.gph-mk--fact') !== null }; })()")
                    check(f'{t} the settling resale corner is fact only (open marker, no halo), with its settling wording', rv['state'] == 'fact' and rv['fact'] and not rv['cmp'] and not rv['halo'] and rv['leg'] and rv['word'] == 'Initial resale wave; sustained activity settling', rv)
                check(f'{t} Simple hides the section bar, the full analysis and the five dimensions; Sources stay', not st['dims'] and not st['bar'] and not st['full'] and st['sources'], st)
                check(f'{t} the quick read\'s headline (and, with a strip, its figures) are not shown twice', not st['qrHead'] and (not st['qrFigs'] or not ex['figs']), st)
                check(f'{t} summary first: every figure keeps its approved comparison, and the one warning follows the figures', all(f['cmp'] for f in st['figs']) and st['warnAfter'], [st['figs'], st['warnAfter']])
                check(f'{t} the views and actions stay; the decorative graphic is gone', st['tabs'] and st['acts'] and not st['deco'], st)
                a = st['attr']
                check(f'{t} OneMap\'s logo and "OneMap © contributors | Singapore Land Authority", both linked, on the map and never covered', a and a['t'] == 'OneMap © contributors | Singapore Land Authority' and a['links'] == ['https://www.onemap.gov.sg/', 'https://www.sla.gov.sg/'] and a['img'].endswith('/om_logo.png') and a['top'] and a['inside'], a)
                check(f'{t} after 5 s the flight is done and nothing is still moving', st['flight'] == 'done' and st['running'] == 0, [st['flight'], st['running']])
                budget = 70 if w >= 720 else 24
                check(f'{t} tile requests within budget ({n["t"]} ≤ {budget}; the prototype loaded 114 / 38)', 0 < n['t'] <= budget, n['t'])
                check(f'{t} no sideways scroll', st['noover'])
                if w == 390 and i in ('thomson-three', 'bartley-ridge', 'alba'):
                    check(f'{t} phone first screen: the name, the opening and every figure (value and label) without scrolling (844 px)', max(f['bottom'] for f in st['figs']) <= 844, [f['bottom'] for f in st['figs']])
                if st['figs']: check(f'{t} figures are large and readable (≥ 22 px)', min(f['fs'] for f in st['figs']) >= 22, [f['fs'] for f in st['figs']])
            check(f'{vn} no script errors', not errs, errs)
            # Simple -> Detailed, a figure opens its dimension, the choice is remembered
            if w in (1440, 390):
                i = 'thomson-three'; pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); ready(pg, i)
                pg.click('[data-gph-mode="detailed"]'); pg.wait_for_timeout(200); st = pg.evaluate(STATE)
                check(f'{vn} Detailed shows the section bar, the full-analysis button and the five dimensions, as before', st['mode'] == 'detailed' and st['dims'] and st['bar'] and st['full'], st)
                pg.click('[data-gph-mode="simple"]'); pg.wait_for_timeout(100)
                pg.click('[data-gph-fig][data-gph-dim="M"]'); pg.wait_for_timeout(700)
                m = pg.evaluate("() => ({ mode: document.querySelector('.gwp-page').getAttribute('data-gph-mode'), open: document.querySelector('[data-gwp-toggle=\"M\"]').getAttribute('aria-expanded'), y: document.querySelector('#gwp-M').getBoundingClientRect().top, hash: location.hash })")
                check(f'{vn} a figure opens Detailed at its dimension, opened and in view, without changing the address', m['mode'] == 'detailed' and m['open'] == 'true' and -5 < m['y'] < 400 and m['hash'] == f'#/prism/{i}', m)
                pg.reload(wait_until='domcontentloaded'); ready(pg, i); st = pg.evaluate(STATE)
                check(f'{vn} the Detailed choice is remembered on this browser', st['mode'] == 'detailed', st['mode'])
                pg.click('[data-gph-mode="simple"]'); pg.wait_for_timeout(100)
                pg.click('[data-gph-corner="P"]'); pg.wait_for_timeout(600)
                m = pg.evaluate("() => ({ mode: document.querySelector('.gwp-page').getAttribute('data-gph-mode'), open: document.querySelector('[data-gwp-toggle=\"P\"]').getAttribute('aria-expanded') })")
                check(f'{vn} a pentagon corner opens Detailed at its dimension', m['mode'] == 'detailed' and m['open'] == 'true', m)
                pg.click('[data-gph-mode="simple"]')
                pg.goto(f'{B}/research/#/prism/{i}/s', wait_until='domcontentloaded'); ready(pg, i); pg.wait_for_timeout(400)
                m = pg.evaluate("() => ({ mode: document.querySelector('.gwp-page').getAttribute('data-gph-mode'), open: document.querySelector('[data-gwp-toggle=\"S\"]').getAttribute('aria-expanded'), stored: localStorage.getItem('gw.prism.mode') })")
                check(f'{vn} a link to one dimension (#/prism/<id>/s) opens Detailed there, without changing the remembered choice', m['mode'] == 'detailed' and m['open'] == 'true' and m['stored'] == 'simple', m)
                # the two V1 Verdict pages: no hero, the Verdict as before
                for v in V1:
                    pg.goto(f'{B}/research/#/prism/{v}', wait_until='domcontentloaded'); ready(pg, v)
                    q = pg.evaluate("() => ({ hero: !!document.querySelector('[data-gph]'), verdict: !!document.querySelector('.gwp-card .gwp-vh'), h1: !!document.querySelector('.gwp-head .gwp-h1'), dims: getComputedStyle(document.querySelector('.gwp-dims')).display !== 'none', mode: document.querySelector('.gwp-page').getAttribute('data-gph-mode') })")
                    check(f'{vn} {v}: no hero; the approved Verdict layout is unchanged', not q['hero'] and q['verdict'] and q['h1'] and q['dims'] and q['mode'] is None, q)
            ctx.close()
        # reduced motion: the final frame at once, one layer, nothing moving
        for w in [1440, 390]:
            ctx, n = ctx_for(w, rm=True); pg = ctx.new_page(); i = 'thomson-three'
            pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); ready(pg, i); pg.wait_for_timeout(600); st = pg.evaluate(STATE)
            check(f'{w}px reduced motion: the final frame at once, no zoom-14 layer, nothing moving', st['flight'] == 'done' and st['l14'] == 0 and st['running'] == 0, st)
            check(f'{w}px reduced motion: only the final layer\'s tiles ({n["t"]} ≤ {30 if w >= 720 else 9})', 0 < n['t'] <= (30 if w >= 720 else 9), n['t'])
            ctx.close()
        # no tiles / no position: everything else stays
        for w in [1440, 390]:
            ctx, n = ctx_for(w, tiles=False); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200])); i = 'bartley-ridge'
            pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); ready(pg, i); pg.wait_for_timeout(2500); st = pg.evaluate(STATE)
            check(f'{w}px no tiles: said on the map; the opening, figures and pentagon stay', st['tiles'] == 'failed' and st['note'] and st['headVis'] and len(st['figs']) == 4 and st['glance'] and not errs, [st, errs])
            ctx.close()
            ctx, n = ctx_for(w, places=False); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); ready(pg, i); pg.wait_for_timeout(1500); st = pg.evaluate(STATE)
            check(f'{w}px no Map position: a plain hero (no map, no tiles, no attribution needed); everything else stays', st['plain'] and n['t'] == 0 and st['attr'] is None and st['headVis'] and len(st['figs']) == 4 and st['noover'] and not errs, [st['plain'], n['t'], st['attr'], st['headVis'], len(st['figs']), st['noover'], errs])
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'\n{ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
