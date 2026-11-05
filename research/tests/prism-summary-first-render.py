"""PRISM summary first (Master Planning, 4 Nov 2026) in a real browser: desktop (1440), phone (390) and 200% zoom (195).
Run from the site folder:  python3 research/tests/prism-summary-first-render.py   (LIVE=https://... against a deployed site)
1 the original PRISM logo (the five-facet mark) everywhere PRISM shows its mark, loaded
2 the answer first: one headline, the three figures (two where only two exist), each with its approved comparison, and ONE warning, in
  that order, inside the quick read; on desktop all of it on the first screen; on every width before the Reveal and the dimensions
3 the approved parts kept: the Reveal with its qualifications, What looks promising, Also watch, Before you buy, "Explore full PRISM
  analysis" (opens the V2 explanation); on the two V1 pages the Verdict, its Reveal, Hidden connections and the next buyer question
4 the five dimensions, each with its key finding; none open on a first visit; each opens directly below its own row and independently
  (several at once); Expand all / Collapse all; a P/R/I/S/M chip opens that dimension and moves to it; a #/prism/<id>/<dim> link opens
  it; the open set survives a round trip to Property Data and Back
5 nothing runs past its box; no sideways scroll; no script error"""
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
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
# id: (kind, figures, Reveal or Verdict text that must stay, what the warning must be)
PAGES = {
    'regentville': ('profile', 3, 'PRISM Reveal · Resale activity is above most peers', 'Farther from an MRT or LRT station than most similar developments.'),
    'thomson-three': ('profile', 3, 'PRISM Reveal · A relatively quiet surrounding resale market', None),
    'hundred-palms-residences': ('profile', 3, 'PRISM Reveal · High resale activity, but sustained activity is still settling', None),
    'the-quinn': ('profile', 3, None, None),
    'lush-acres': ('profile', 3, None, None),   # no watch sentence: the first figure's approved limitation is the warning
    '8-raja': ('profile', 2, None, None),       # partial: two figures only
    'kingsford-waterbay': ('v1', 3, 'Regular project-wide resale activity', 'The 194 rental contracts in 12 months include renewals'),
    'hougang-central': ('v1', 3, None, None),
}
SUMMARY = """(() => { const q = document.querySelector('[data-gwp-quick]'); if (!q) return null; const top = q.querySelector('[data-gwp-short]');
  const r = (e) => e ? e.getBoundingClientRect() : null, y = (e) => e ? Math.round(r(e).top + scrollY) : null, b = (e) => e ? Math.round(r(e).bottom + scrollY) : null;
  const figs = [...top.querySelectorAll('.gwp-qr-f')], w = top.querySelectorAll('[data-gwp-warn]'), h = top.querySelectorAll('h2.gwp-qr-h');
  const over = [...q.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible' && e.clientWidth > 0).map((e) => e.className).slice(0, 3);
  return { heads: h.length, head: h[0] && h[0].textContent, figs: figs.length, cmp: figs.map((f) => (f.querySelector('.gwp-qr-c') || {}).textContent || ''), warns: w.length, warn: w[0] && w[0].textContent,
    yHead: y(h[0]), yFig: figs.length ? y(figs[0]) : null, yFigEnd: figs.length ? Math.max(...figs.map(b)) : null, yWarn: y(w[0]), bWarn: b(w[0]),
    yMore: y(q.querySelector('.gwp-qr-more, .gwp-qr-n')), yReveal: y(q.querySelector('.gwp-qr-rv')), yDims: y(document.querySelector('.gwp-dims')),
    yVerdict: y(document.querySelector('.gwp-card')), text: document.querySelector('[data-gwp-page]').textContent.replace(/\\s+/g, ' '), over }; })()"""
DIMS = """(() => [...document.querySelectorAll('[data-gwp-toggle]')].map((b) => { const p = document.getElementById(b.getAttribute('aria-controls')), r = b.getBoundingClientRect(), pr = p.getBoundingClientRect();
  return { k: b.dataset.gwpToggle, open: b.getAttribute('aria-expanded') === 'true' && !p.hidden, hl: (b.querySelector('[data-gwp-headline] b') || {}).textContent || '', rowB: Math.round(r.bottom), pT: Math.round(pr.top), pB: Math.round(pr.bottom) }; }))()"""
openset = lambda d: ''.join(x['k'] for x in d if x['open'])
def fresh(ctx, url, id):
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    pg.goto(url); pg.wait_for_selector(f'[data-gwp-page="{id}"]', timeout=30000); pg.wait_for_timeout(700); return pg, errs
def click(pg, sel):
    el = pg.locator(sel).first; el.scroll_into_view_if_needed(); el.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(250)   # keyboard: at 200% zoom the sticky bars may cover a centre
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; mob = w < 500; H = {1440: 900, 390: 844, 195: 422}[w]
            ctx = br.new_context(viewport={'width': w, 'height': H}, is_mobile=mob, has_touch=mob)
            for id, (kind, nf, keep, warn) in PAGES.items():
                pg, errs = fresh(ctx, B + '/research/#/prism/' + id, id)
                # 1 logo
                lg = pg.evaluate("[...document.querySelectorAll('img.gwp-mark')].map((i) => [i.getAttribute('src').split('/').pop(), i.complete && i.naturalWidth > 0])")
                check(f'{vn} {id}: the original PRISM logo in every PRISM mark ({len(lg)}), loaded', len(lg) >= 2 and all(x == ['prism-mark-original.png', True] for x in lg), lg)
                # 2 the answer first
                sm = pg.evaluate(SUMMARY)
                good = sm and sm['heads'] == 1 and sm['figs'] == nf and sm['warns'] == 1 and sm['yHead'] < sm['yFig'] < sm['yWarn'] and sm['yFigEnd'] <= sm['yWarn'] + 1 and sm['bWarn'] <= sm['yMore'] + 1
                check(f'{vn} {id}: one headline, {nf} figures, then one warning, in that order, before the rest of the quick read', good, sm and {k: sm[k] for k in ('heads', 'figs', 'warns', 'yHead', 'yFig', 'yFigEnd', 'yWarn', 'yMore')})
                if not sm: pg.close(); continue
                if kind == 'profile': check(f'{vn} {id}: every figure keeps its comparison beneath it', all(sm['cmp']), sm['cmp'])
                if warn: check(f'{vn} {id}: the warning is "{warn}"', (sm['warn'] or '').strip() == 'Watch out: ' + warn, sm['warn'])
                firsts = [v for v in (sm['yReveal'], sm['yDims'], sm['yVerdict']) if v is not None]
                check(f'{vn} {id}: the answer comes before the Reveal, the Verdict and the dimensions', all(sm['bWarn'] <= v for v in firsts), [sm['bWarn'], firsts])
                if w == 1440: check(f'{vn} {id}: headline, figures and warning all on the first screen (warning ends at {sm["bWarn"]} px of {H})', sm['bWarn'] <= H, sm['bWarn'])
                else: print(f'       info {vn} {id}: the warning ends at {sm["bWarn"]} px ({sm["bWarn"] / H:.2f} screens)')
                # 3 approved parts kept
                if keep: check(f'{vn} {id}: approved "{keep}" still shown', keep in sm['text'], keep)
                if kind == 'profile':
                    t = sm['text']; check(f'{vn} {id}: Before you buy and "Explore full PRISM analysis" kept', 'Before you buy' in t and 'Explore full PRISM analysis' in t)
                    click(pg, '[data-gwp-full]'); check(f'{vn} {id}: "Explore full PRISM analysis" opens the V2 explanation', pg.evaluate("!document.getElementById('gwp-full').hidden && !!document.querySelector('#gwp-full .gwp-xp')"))
                else:
                    t = sm['text']; check(f'{vn} {id}: the Verdict, Why, What should I watch out for, its Reveal, Hidden connections and the next buyer question kept', all(x in t for x in ['PRISM Verdict', 'Why?', 'What should I watch out for?', 'PRISM Reveal', 'Next buyer question']) and ('Hidden connections' in t or id == 'hougang-central'), [x for x in ['PRISM Verdict', 'Why?', 'What should I watch out for?', 'PRISM Reveal', 'Hidden connections', 'Next buyer question'] if x not in t])
                # 4 dimensions
                d = pg.evaluate(DIMS)
                check(f'{vn} {id}: five dimensions, each with its key finding; none open on a first visit', [x['k'] for x in d] == list('PRISM') and all(x['hl'].strip() for x in d) and openset(d) == '', [(x['k'], x['hl'], x['open']) for x in d])
                if id in ('regentville', 'kingsford-waterbay', 'thomson-three'):
                    check(f'{vn} {id}: every dimension\'s finding is a number', all(re.search(r'\d', x['hl']) for x in d), [x['hl'] for x in d])
                    click(pg, '[data-gwp-toggle="R"]'); d = pg.evaluate(DIMS); R, I = d[1], d[2]
                    check(f'{vn} {id}: R opens alone, directly below its own row, I after it', openset(d) == 'R' and abs(R['pT'] - R['rowB']) <= 24 and I['rowB'] > R['pB'], [openset(d), R, I['rowB']])
                    click(pg, '[data-gwp-toggle="S"]'); d = pg.evaluate(DIMS); check(f'{vn} {id}: S opens without closing R (independent)', openset(d) == 'RS', openset(d))
                    click(pg, '[data-gwp-toggle="R"]'); d = pg.evaluate(DIMS); check(f'{vn} {id}: R closes, S stays open', openset(d) == 'S', openset(d))
                    click(pg, '[data-gwp-all="open"]'); d = pg.evaluate(DIMS); check(f'{vn} {id}: Expand all opens all five', openset(d) == 'PRISM', openset(d))
                    click(pg, '[data-gwp-all="close"]'); d = pg.evaluate(DIMS); check(f'{vn} {id}: Collapse all closes all five', openset(d) == '', openset(d))
                    click(pg, '[data-gwp-jump="M"]'); pg.wait_for_timeout(300); d = pg.evaluate(DIMS)
                    mt = pg.evaluate("document.getElementById('gwp-M').getBoundingClientRect().top")
                    check(f'{vn} {id}: the M chip opens Market Demand and moves to it', openset(d) == 'M' and 0 <= mt < H, [openset(d), mt])
                    click(pg, '[data-gwp-toggle="R"]'); d = pg.evaluate(DIMS)   # M and R open
                    click(pg, '[data-gwp-switch] [data-gwp-view="data"]'); pg.wait_for_function(f"location.hash === '#/p/{id}'", timeout=20000); pg.wait_for_timeout(1500)
                    pg.go_back(); pg.wait_for_selector(f'[data-gwp-page="{id}"]', timeout=30000); pg.wait_for_timeout(800); d = pg.evaluate(DIMS)
                    check(f'{vn} {id}: after Property Data and Back, the same dimensions are open (R, M)', openset(d) == 'RM', openset(d))
                check(f'{vn} {id}: nothing runs past its box; no sideways scroll', not sm['over'] and pg.evaluate(NOOVER), sm['over'])
                check(f'{vn} {id}: no script error', not errs, errs[:2])
                pg.close()
            # a link to one dimension, on a first visit: that one open
            c2 = br.new_context(viewport={'width': w, 'height': H}, is_mobile=mob, has_touch=mob)
            pg, errs = fresh(c2, B + '/research/#/prism/regentville/s', 'regentville'); pg.wait_for_timeout(500); d = pg.evaluate(DIMS)
            check(f'{vn} #/prism/regentville/s opens Supply Pressure only', openset(d) == 'S', openset(d)); c2.close(); ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-summary-first-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
