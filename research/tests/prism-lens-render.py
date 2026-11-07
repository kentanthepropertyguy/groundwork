"""Market Lens in PRISM (GW-PRISM-ML-V1-2026-11-07-A1) in a real browser: desktop (1440), phone (390, 360), 200% zoom (195), reduced motion.
Run from the site folder:  python3 research/tests/prism-lens-render.py
  LIVE=https://...   against a deployed site (the preview is turned on with ?lens=preview, for this browser only)
  REF=<site folder>  the same release without Market Lens: with the switch off, every page must read exactly as it does there
 - the switch is off: no Market Lens request and no Market Lens element anywhere; Parc Clematis still opens Property Data, as before
 - preview on: Parc Clematis (no PRISM page) gets a Market Lens view with the hero, the strip and the pentagon; Belgravia Ace facts only;
   Bartley Ridge (a PRISM page) gets the card after the pentagon and the lines inside the five dimensions in Detailed; Property Data shows
   the PRISM Analysis tab for a Market Lens view; a new launch keeps its current page; the protected pages never load Market Lens
 - fail closed: a changed root, shard or report shows no Market Lens at all, and the page falls back exactly as before
 - phone, 200% zoom and reduced motion: no sideways scroll, no script errors"""
import base64, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
REF = os.environ.get('REF')
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:600] if info else ''))
def serve(folder):
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    pr = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], cwd=str(folder), env={**os.environ, 'PORT': str(port), 'ROOT': str(folder)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', port), 0.2).close(); break
        except OSError: time.sleep(0.05)
    return pr, f'http://127.0.0.1:{port}'
srv, B = serve(SITE)
if os.environ.get('LIVE'): B = os.environ['LIVE'].rstrip('/')
rsrv = None
if REF:
    # serve-local.js serves the folder it sits in; the reference copy uses its own
    s = socket.socket(); s.bind(('127.0.0.1', 0)); rport = s.getsockname()[1]; s.close()
    rsrv = subprocess.Popen(['node', str(pathlib.Path(REF) / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(rport)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(100):
        try: socket.create_connection(('127.0.0.1', rport), 0.2).close(); break
        except OSError: time.sleep(0.05)
    RB = f'http://127.0.0.1:{rport}'
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==')
H = {1440: 900, 390: 844, 360: 740, 195: 422}
STATE = """() => { const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const pg = document.querySelector('.gwp-page'), card = document.querySelector('[data-gml-card]'), glance = document.querySelector('[data-gph-glance]');
  return { hash: location.hash, mode: pg && pg.getAttribute('data-gwp-mode'), page: pg && pg.getAttribute('data-gwp-page'), hero: !!document.querySelector('[data-gph]'),
    figs: [...document.querySelectorAll('[data-gph-fig]')].map((f) => (f.querySelector('.gph-fv') || {}).textContent), corners: document.querySelectorAll('[data-gph-corner]').length,
    head: ((document.querySelector('.gph-h') || {}).textContent || '').trim(), cards: document.querySelectorAll('[data-gml-card]').length, kind: card && (card.querySelector('[data-gml-kind]') || {getAttribute: () => null}).getAttribute('data-gml-kind'), main: card ? [...card.children].filter((e) => e.tagName !== 'DETAILS').map((e) => e.textContent).join(' ').replace(/\\s+/g, ' ').trim() : '',
    cardText: card ? card.textContent.replace(/\\s+/g, ' ').trim() : '', cardVis: vis(card), afterGlance: !!(card && glance && (glance.compareDocumentPosition(card) & 4)),
    answerInCard: !!(card && card.querySelector('[data-gml-answer]')), secs: document.querySelectorAll('[data-gml-sec]').length, dims: document.querySelectorAll('[data-gml-dim]').length,
    dimsVis: [...document.querySelectorAll('[data-gml-dim]')].filter(vis).length, watch: document.querySelectorAll('[data-gml-watch]').length, gml: document.querySelectorAll('[data-gml],[data-gml-card],[data-gml-dim],[data-gml-sec],[data-gml-watch],[data-gml-kind],[data-gml-answer]').length,
    tabs: [...document.querySelectorAll('[data-gwp-view]')].map((a) => [a.getAttribute('data-gwp-view'), a.getAttribute('href'), a.getAttribute('aria-current')]), na: !!document.querySelector('[data-gwp-na]'),
    focus: document.activeElement && document.activeElement.tagName, noover: document.documentElement.scrollWidth <= innerWidth + 1,
    text: (() => { const a = document.querySelector('#app'); if (!a) return ''; const c = a.cloneNode(true); c.querySelectorAll('[data-gph-map],script,style').forEach((e) => e.remove()); return c.textContent.replace(/\\s+/g, ' ').trim(); })() }; }"""
def page_ready(pg, i, prop=False):
    if prop: pg.wait_for_function(f"() => /#\\/p\\/{i}/.test(location.hash) && !!document.querySelector('#app h1')", timeout=30000)
    else: pg.wait_for_function(f"() => !!document.querySelector('.gwp-page[data-gwp-page=\"{i}\"]') || /#\\/p\\//.test(location.hash) && !!document.querySelector('#app h1')", timeout=30000)
    pg.wait_for_timeout(2500)
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        def ctx_for(w=1440, preview=False, rm=False, tamper=None):
            mob = w < 500
            ctx = br.new_context(viewport={'width': w, 'height': H[w]}, is_mobile=mob, has_touch=mob, reduced_motion='reduce' if rm else 'no-preference')
            if preview: ctx.add_init_script("try{localStorage.setItem('gw.lens.preview','1')}catch(e){}")
            reqs = []
            ctx.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=PNG, content_type='image/png'))
            ctx.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
            def lens(r):
                reqs.append(r.request.url)
                if tamper and re.search(tamper, r.request.url):
                    resp = r.fetch(); body = resp.text() + ' '
                    return r.fulfill(status=200, body=body, content_type='application/json')
                return r.continue_()
            ctx.route(re.compile(r'/data/lens/'), lens)
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('console', lambda m: errs.append('console: ' + m.text[:160]) if m.type == 'error' else None)
            return ctx, pg, reqs, errs

        # ---- 1 the switch is off (the default for every visitor)
        ctx, pg, reqs, errs = ctx_for()
        off = {}
        for i in ['bartley-ridge', 'thomson-three', 'parc-clematis', 'belgravia-ace', 'lentor-modern', 'kingsford-waterbay']:
            pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); page_ready(pg, i); off[i] = pg.evaluate(STATE)
        pg.goto(f'{B}/research/#/p/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis', True); off['p/parc-clematis'] = pg.evaluate(STATE)
        check('switch off: no Market Lens request and no Market Lens element on any page', not reqs and all(s['gml'] == 0 for s in off.values()) and not errs, [reqs[:3], {k: s['gml'] for k, s in off.items()}, errs])
        check('switch off: Parc Clematis and Belgravia Ace (no PRISM page) open Property Data, as before', off['parc-clematis']['hash'] == '#/p/parc-clematis' and off['belgravia-ace']['hash'] == '#/p/belgravia-ace', [off['parc-clematis']['hash'], off['belgravia-ace']['hash']])
        check('switch off: Property Data keeps its "not available" PRISM note', off['p/parc-clematis']['na'], off['p/parc-clematis']['tabs'])
        ctx.close()
        if REF:
            ctx = br.new_context(viewport={'width': 1440, 'height': 900}); ctx.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, body=PNG, content_type='image/png'))
            ctx.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body='')); rp = ctx.new_page(); diff = []
            for k, s in off.items():
                i = k.split('/')[-1]; prop = k.startswith('p/')
                rp.goto(f'{RB}/research/#/{"p" if prop else "prism"}/{i}', wait_until='domcontentloaded'); page_ready(rp, i, prop); r = rp.evaluate(STATE)
                if r['text'] != s['text'] or r['hash'] != s['hash'] or r['figs'] != s['figs'] or r['corners'] != s['corners']: diff.append([k, r['hash'], s['hash'], len(r['text']), len(s['text'])])
            check('switch off: every page reads exactly as the same release without Market Lens (text, figures, corners, route)', not diff, diff)
            ctx.close()

        # ---- 2 preview on, desktop
        ctx, pg, reqs, errs = ctx_for(preview=True)
        pg.goto(f'{B}/research/#/prism/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis'); s = pg.evaluate(STATE)
        check('Parc Clematis: a Market Lens view on PRISM Analysis (the hero, 3 figures, 5 corners, the card, five headings)',
              s['hash'] == '#/prism/parc-clematis' and s['mode'] == 'lens' and s['hero'] and s['figs'] == ['610 m', '$2,161 psf', '128'] and s['corners'] == 5 and s['cards'] == 1 and s['kind'] == 'observed' and s['secs'] == 5, s)
        check('Parc Clematis: the answer is the hero headline, not repeated in the card; the card follows the pentagon; the heading takes focus',
              s['head'].startswith('A popular primary school within 1 km') and not s['answerInCard'] and s['afterGlance'] and s['focus'] == 'H1', [s['head'], s['answerInCard'], s['afterGlance'], s['focus']])
        check('Parc Clematis: the card says observed, its period, past not future; tabs are PRISM Analysis (current) and Property Data',
              'Observed price' in s['cardText'] and '(Oct 2024 to Sep 2026)' in s['cardText'] and 'This describes past prices, not future ones.' in s['cardText'] and s['tabs'][0][2] == 'page' and s['tabs'][1][1].endswith('#/p/parc-clematis'), [s['cardText'][:300], s['tabs']])
        pg.goto(f'{B}/research/#/prism/belgravia-ace', wait_until='domcontentloaded'); page_ready(pg, 'belgravia-ace'); s = pg.evaluate(STATE)
        check('Belgravia Ace (strata landed, no resales): facts only, no price, no comparison', s['mode'] == 'lens' and s['kind'] == 'facts' and 'Too few sales to show a price.' in s['cardText'] and 'psf' not in s['main'] and 'in line with' not in s['main'] and 'above similar' not in s['main'] and 'below similar' not in s['main'] and 'Prices rose' not in s['main'], s['main'][:300])
        pg.goto(f'{B}/research/#/prism/bartley-ridge', wait_until='domcontentloaded'); page_ready(pg, 'bartley-ridge'); s = pg.evaluate(STATE)
        check('Bartley Ridge (a PRISM page): PRISM unchanged, one Market Lens card after the pentagon, observed, PRISM\'s opening not competing with a second headline', s['mode'] != 'lens' and s['hero'] and s['cards'] == 1 and s['afterGlance'] and s['kind'] == 'observed' and not s['answerInCard'], s)
        check('Bartley Ridge: the Market Lens lines sit inside the five dimensions and stay hidden in Simple', s['dims'] >= 3 and s['dimsVis'] == 0, [s['dims'], s['dimsVis']])
        wl = pg.evaluate("() => fetch('../data/lens/v1/reports/bartley-ridge.json').then((r) => r.json()).then((j) => j.text.watch.length)")
        pg.click('[data-gph-corner="P"]'); pg.wait_for_timeout(700)
        vis = pg.evaluate("() => { const d = document.querySelector('[data-gml-dim=\\'P\\']'); return [!!d && d.getClientRects().length > 0, ((d || {}).textContent || '').replace(/\\s+/g, ' ').slice(0, 160)]; }")
        check('Bartley Ridge Detailed, Price Position open: the Market Lens price lines show inside it; the watch list matches the export', vis[0] and '$1,941 psf' in vis[1] and pg.evaluate("() => document.querySelectorAll('[data-gml-watch]').length") == (1 if wl else 0), [vis, wl])
        pg.click('[data-gph-mode="simple"]'); pg.wait_for_timeout(200)
        pg.goto(f'{B}/research/#/prism/lentor-modern', wait_until='domcontentloaded'); page_ready(pg, 'lentor-modern'); s = pg.evaluate(STATE)
        check('Lentor Modern (a new launch): its page is as before, with no Market Lens', s['gml'] == 0 and s['hash'] == off['lentor-modern']['hash'], [s['gml'], s['hash']])
        pg.goto(f'{B}/research/#/prism/lakeside-tower', wait_until='domcontentloaded'); page_ready(pg, 'lakeside-tower'); s = pg.evaluate(STATE)
        check('Lakeside Tower (a PRISM page, Market Lens facts only): nothing added; PRISM shows its own facts', s['gml'] == 0 and s['mode'] == 'profile', [s['gml'], s['mode']])
        pg.goto(f'{B}/research/#/prism/lumina-grand', wait_until='domcontentloaded'); page_ready(pg, 'lumina-grand'); s = pg.evaluate(STATE)
        check('Lumina Grand (pending, facts only): a Market Lens view; the card says "too few sales" once', s['mode'] == 'lens' and s['main'].count('sales to show a price') == 1, s['main'][:300])
        n0 = len(reqs)
        for i in ['thomson-three', 'kingsford-waterbay', 'hougang-central', 'hundred-palms-residences', 'the-quinn']:
            pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); page_ready(pg, i); s = pg.evaluate(STATE)
            check(f'{i} (protected): no Market Lens element, no Market Lens report requested; the page reads as with the switch off' if i in off else f'{i} (protected): no Market Lens element and no report requested',
                  s['gml'] == 0 and not any(f'/reports/{i}.json' in u for u in reqs[n0:]) and (i not in off or s['text'] == off[i]['text']), [s['gml'], reqs[n0:]])
        pg.goto(f'{B}/research/#/p/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis', True); pg.wait_for_timeout(800); s = pg.evaluate(STATE)
        check('Property Data for Parc Clematis: the "not available" note gives way to the PRISM Analysis tab', not s['na'] and any(t[0] == 'prism' and t[1] and t[1].endswith('#/prism/parc-clematis') for t in s['tabs']), s['tabs'])
        check('preview on, desktop: no script errors', not errs, errs)
        ctx.close()

        # ---- 3 phones, 200% zoom, reduced motion
        for w, rm in [(390, False), (360, False), (195, False), (390, True)]:
            ctx, pg, reqs, errs = ctx_for(w, preview=True, rm=rm); bad = []
            for i in ['parc-clematis', 'bartley-ridge', 'belgravia-ace']:
                pg.goto(f'{B}/research/#/prism/{i}', wait_until='domcontentloaded'); page_ready(pg, i); s = pg.evaluate(STATE)
                if not (s['cards'] == 1 and s['cardVis'] and s['noover']): bad.append([i, s['cards'], s['cardVis'], s['noover']])
            check(f'{w}px{" reduced motion" if rm else ""}: the card shows on all three, no sideways scroll, no script errors', not bad and not errs, [bad, errs])
            ctx.close()

        # ---- 4 fail closed
        for what, rx in [('the root index', r'/data/lens/v1/index\.json'), ('a shard', r'/data/lens/v1/index/[0-9a-f]\.json'), ('a report', r'/data/lens/v1/reports/')]:
            ctx, pg, reqs, errs = ctx_for(preview=True, tamper=rx)
            pg.goto(f'{B}/research/#/prism/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis'); a = pg.evaluate(STATE)
            pg.goto(f'{B}/research/#/prism/bartley-ridge', wait_until='domcontentloaded'); page_ready(pg, 'bartley-ridge'); b = pg.evaluate(STATE)
            check(f'fail closed ({what} changed): no Market Lens; Parc Clematis opens Property Data, Bartley Ridge reads as with the switch off',
                  a['hash'] == '#/p/parc-clematis' and a['gml'] == 0 and b['gml'] == 0 and b['text'] == off['bartley-ridge']['text'] and not [e for e in errs if 'console' not in e], [a['hash'], a['gml'], b['gml'], errs])
            ctx.close()

        # ---- 5 ?lens=off turns the preview off again
        ctx, pg, reqs, errs = ctx_for()
        pg.goto(f'{B}/research/?lens=preview#/prism/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis'); u = pg.evaluate(STATE)
        check('"?lens=preview" turns the preview on for this browser: Parc Clematis shows its Market Lens view', u['mode'] == 'lens' and u['cards'] == 1, [u['hash'], u['mode']])
        pg.goto(f'{B}/research/#/prism/bartley-ridge', wait_until='domcontentloaded'); page_ready(pg, 'bartley-ridge'); u = pg.evaluate(STATE)
        check('the preview is remembered on the next visit (same browser)', u['cards'] == 1, u['cards'])
        pg.goto(f'{B}/research/?lens=off#/prism/parc-clematis', wait_until='domcontentloaded'); page_ready(pg, 'parc-clematis'); s = pg.evaluate(STATE)
        pg.goto(f'{B}/research/#/prism/bartley-ridge', wait_until='domcontentloaded'); page_ready(pg, 'bartley-ridge'); t = pg.evaluate(STATE)
        check('"?lens=off" turns the preview off: Property Data as before, and no card afterwards', s['hash'] == '#/p/parc-clematis' and t['gml'] == 0, [s['hash'], t['gml']])
        ctx.close()
        br.close()
finally:
    srv.terminate()
    if rsrv: rsrv.terminate()
print(f'\n{ok_n} passed, {fail_n} failed')
raise SystemExit(1 if fail_n else 0)
