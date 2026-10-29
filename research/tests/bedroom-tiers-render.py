# Bedroom pricing tiers (Claude C r2, approved 29 Oct 2026; spec section 5 tests 9, 10 and 12): the real Research page, desktop 1440 and phone 390.
#   python3 research/tests/bedroom-tiers-render.py
# Kovan Melody (3-bed Tier B, 4-bed Tier C), Bartley Ridge (2-bed Tier B with two groups, 3-bed Tier B with other sizes), Hundred Palms Residences
# (5-bed Tier C, R2 unknown). The panel order, its copy (assertPricedMatchedCopy), no typical/budget/Pulse elements and no figure functions, the
# latest five (assertMatchedRows), analytics tier, the index line, and at 390 px no overflow, no clipped chip, two groups stacked.
import json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[2]
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
B = 'http://localhost:%d' % P
for _ in range(50):
    try:
        socket.create_connection(('127.0.0.1', P), timeout=0.2).close(); break
    except OSError: time.sleep(0.1)
ok_n = fail_n = 0
def ok(c, name, info=''):
    global ok_n, fail_n
    if c: ok_n += 1
    else: fail_n += 1; print('  FAIL', name, str(info)[:400])
ALL = {}
for f in (SITE / 'data/projects/bedroom').glob('s*.json'): ALL.update(json.loads(f.read_text())['projects'])
def mo(dev, g): return next(m for m in ALL[dev]['resale']['matched'] if m['g'] == g)
SPY = """window.__calls=[]; ['answerHtml','trendHtml','numbersHtml','finding','typical','budgetText','sizeText'].forEach(k=>{const f=GW_BED[k]; GW_BED[k]=function(){window.__calls.push(k); return f.apply(this,arguments)}});"""
def page(ctx, dev, bed=None):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.route('**/*googletagmanager*', lambda r: r.fulfill(status=200, body=''))
    pg.goto(B + '/research/#/p/' + dev); pg.wait_for_selector('#lgPick'); pg.wait_for_timeout(450)
    pg.evaluate("window.__ev=[]; if (window.KPT) { const t = KPT.track; KPT.track = (n, p) => { window.__ev.push([n, p]); try { t(n, p); } catch (e) {} }; }")
    pg.evaluate(SPY)
    if bed: pg.evaluate("s => document.querySelector(s).click()", '[data-bed="%s"]' % bed); pg.wait_for_timeout(500)
    return pg, errs
def text(pg, sel): return pg.inner_text(sel) if pg.locator(sel).count() else ''
CHECK = """([g]) => { const p = document.querySelector('[data-gwb-matched]'); if (!p) return 'no panel';
  const st = p.closest('[data-lg="project"]').parentElement.__gwrSt, rec = st && st.rec, rows = rec ? GW_REC.matchedRows(rec, g, GW_BED.MATCHED_ROWS) : [];
  const c = p.cloneNode(true); document.body.appendChild(c); const t = c.innerText.replace(/\\s+/g, ' '); c.remove();
  const V = GW_BED.view(window.__bedRec || null, 'resale', g);
  try { GW_BED.assertMatchedRows(p.querySelector('[data-gwb-mrows]').outerHTML, rows); } catch (e) { return 'rows: ' + e.message; }
  return { text: t, rows: rows.length }; }"""
ORDER = """() => { const p = document.querySelector('[data-gwb-matched]'), q = (s) => [...p.querySelectorAll(s)].map((e) => [...p.querySelectorAll('*')].indexOf(e));
  return { tag: q('[data-gwb-mtag]'), groups: q('[data-gwb-group]'), diff: q('[data-gwb-diffsizes]'), qual: q('[data-gwb-qual]'), warn: q('[data-gwb-warn]'), btn: q('[data-gwr-mbed]'), hist: q('[data-gwb-hist]'), cmp: q('[data-gwb-cmp]'), other: q('[data-gwb-other]'), rows: q('[data-gwb-mrows]'), how: q('[data-gwb-how]'), m2: q('[data-gwb-m2]') }; }"""
def inorder(o):   # answer first (Ken, 29 Oct 2026): prices, note, qualification, warning, button, then the two disclosures
    seq = [x for k in ['tag', 'groups', 'diff', 'qual', 'warn', 'btn', 'hist', 'cmp', 'other', 'rows', 'how', 'm2'] for x in o[k]]
    return seq == sorted(seq) and len(o['hist']) == 1 and len(o['how']) == 1
FULL = """() => { const c = document.querySelector('[data-gwb-matched]').cloneNode(true); c.querySelectorAll('details').forEach((d) => d.open = true); document.body.appendChild(c); const t = c.innerText.replace(/\\s+/g, ' '); c.remove(); return t; }"""
VIS = """() => document.querySelector('[data-gwb-matched]').innerText.replace(/\\s+/g, ' ')"""
PRICED = '[data-gwb-ans], [data-gwb-trend], [data-gwb-numbers], [data-gwb-budget], .gwr-rentline, [data-mp], [data-lg-ov]'
def copy_ok(pg, dev, g):
    m = mo(dev, g); r = ALL[dev]['resale']
    return pg.evaluate("""([rec]) => { const p = document.querySelector('[data-gwb-matched]'), st = p.closest('[data-lg="project"]').parentElement.__gwrSt, rows = GW_REC.matchedRows(st.rec, rec.g, GW_BED.MATCHED_ROWS);
      const c = p.cloneNode(true); c.querySelectorAll('details').forEach((d) => d.open = true); document.body.appendChild(c); const t = c.innerText.replace(/\\s+/g, ' '); c.remove();
      try { return GW_BED.assertPricedMatchedCopy(t, rec, { rows }); } catch (e) { return e.message; } }""", [dict(m, of=r['of'], unknown=r['unknown'])])
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            for dev, g, tier, tag in [('kovan-melody', '3', 'B', 'median'), ('kovan-melody', '4', 'C', 'historical'), ('bartley-ridge', '2', 'B', 'median'), ('bartley-ridge', '3', 'B', 'median'), ('hundred-palms-residences', '5', 'C', 'historical')]:
                ctx = b.new_context(**kw); pg, errs = page(ctx, dev, g); m = mo(dev, g)
                ok(pg.get_attribute('[data-gwb-matched]', 'data-gwb-tier') == tier, vn + ': %s %s-bedroom is Tier %s' % (dev, g, tier))
                ok(inorder(pg.evaluate(ORDER)), vn + ': %s %s: answer first (prices, qualification, warning, button, then Sales history and How these prices are calculated)' % (dev, g), pg.evaluate(ORDER))
                ok(pg.locator(PRICED).count() == 0 and pg.locator('.lg-numgrid svg').count() == 0, vn + ': %s %s: no answer, typical price, price movement, numbers, budget, rent, overview or chart' % (dev, g))
                ok(pg.evaluate('window.__calls') == [], vn + ': %s %s: no figure function is called' % (dev, g), pg.evaluate('window.__calls'))
                ok(copy_ok(pg, dev, g) is True, vn + ': %s %s: assertPricedMatchedCopy passes the panel on the page' % (dev, g), copy_ok(pg, dev, g))
                vis = pg.evaluate(VIS)
                ok(pg.evaluate("[...document.querySelectorAll('[data-gwb-matched] details')].every((d) => !d.open)") and 'Past sales at these sizes only · Not a valuation.' in vis and 'No typical price for all' in vis and 'Latest matched resales' not in vis and 'Bedrooms matched from URA' not in vis,
                   vn + ': %s %s: prices, qualification and warning visible; the history and method closed by default' % (dev, g), vis[:300])
                ok(('Different home sizes — these prices are not a comparison over time.' in vis) == (len(m.get('groups') or []) > 1), vn + ': %s %s: the different-sizes note exactly when two medians show' % (dev, g))
                ranges = pg.eval_on_selector_all('[data-gwb-matched] [data-gwb-range]', 'e => e.map(x => x.textContent.replace(/\\s+/g, " ").trim())')
                ok(ranges and all(r.startswith('Historical matched transactions') for r in ranges), vn + ': %s %s: every range starts "Historical matched transactions"' % (dev, g), ranges)
                ev = [e for e in pg.evaluate('window.__ev') if e[0] == 'research_bedroom_selected']
                ok(ev and ev[-1][1] == {'project_id': dev, 'bedroom': g, 'sale_type': 'resale', 'tier': tag}, vn + ': %s %s: analytics tier "%s"' % (dev, g, tag), ev[-1:])
                n = pg.evaluate("""(g) => { const p = document.querySelector('[data-gwb-matched]'), st = p.closest('[data-lg="project"]').parentElement.__gwrSt, rows = GW_REC.matchedRows(st.rec, g, GW_BED.MATCHED_ROWS);
                  try { return GW_BED.assertMatchedRows(p.querySelector('[data-gwb-mrows]').outerHTML, rows) && rows.length; } catch (e) { return e.message; } }""", g)
                ok(n == min(5, m['n24']), vn + ': %s %s: the latest five are the live V2.1 list (test 10)' % (dev, g), n)
                if dev == 'bartley-ridge' and g == '2':
                    gs = pg.eval_on_selector_all('[data-gwb-group]', 'e => e.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left)]; })')
                    if vn == 'phone': ok(len(gs) == 2 and gs[1][0] >= gs[0][1] and gs[0][2] == gs[1][2], vn + ': two medians stack', gs)
                    else:
                        ok(len(gs) == 2 and gs[0][0] == gs[1][0] and gs[1][2] > gs[0][2], vn + ': two medians side by side', gs)
                        w = pg.evaluate("(() => { const p = document.querySelector('[data-gwb-matched]').getBoundingClientRect(), h = document.querySelector('.lg-hero h1').getBoundingClientRect(); return [Math.round(p.width), Math.round(p.left), Math.round(h.left)]; })()")
                        ok(w[0] >= 640 and w[1] > w[2], vn + ': the price card takes the wider right column', w)
                if dev == 'hundred-palms-residences':
                    ok('8 other resales here could not be matched to a bedroom count' in pg.evaluate(FULL), vn + ': Hundred Palms: line 2 reads 8 (R2)')
                pg.click('[data-gwb-matched] [data-gwr-mbed]'); pg.wait_for_timeout(700)
                ok(pg.get_attribute('[data-gwr-count]', 'data-gwr-count') == str(m['n24']) and pg.get_attribute('[data-gwr-bednote]', 'data-m') == str(ALL[dev]['resale']['unknown']), vn + ': %s %s: "See the %d matched resales" lists them; its notice’s unknown equals the panel’s' % (dev, g, m['n24']))
                if vn == 'phone':
                    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(200)
                    geo = pg.evaluate("""() => { const vw = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth > vw + 1,
                      chips: [...document.querySelectorAll('.gwb-chips button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }), vw,
                      panel: (() => { const q = document.querySelector('[data-gwb-matched]').getBoundingClientRect(); return [Math.round(q.left), Math.round(q.right)]; })() }; }""")
                    ok(not geo['over'] and all(c[0] >= 0 and c[1] <= geo['vw'] for c in geo['chips']) and geo['panel'][0] >= 16 and geo['panel'][1] <= geo['vw'] - 16, vn + ': %s %s at 390: no overflow, every chip whole (test 12)' % (dev, g), geo)
                ok(not errs, vn + ': %s %s: no script errors' % (dev, g), errs[:2]); ctx.close()
            # the index line ("What each home type sells for")
            ctx = b.new_context(**kw); pg, errs = page(ctx, 'bartley-ridge')
            also = text(pg, '[data-gwr-also]')
            ok(also == 'Also matched (matched sales only): 2-bedroom 23: Median of 8 past matched resales $1.48m (≈ 721–764 sq ft); 3-bedroom 14: Median of 6 past matched resales $2.17m (≈ 1,033–1,044 sq ft)', vn + ': the Also matched line carries each Tier B median with its sizes', also)
            ctx.close()
        b.close()
finally:
    srv.terminate()
print('bedroom-tiers-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
