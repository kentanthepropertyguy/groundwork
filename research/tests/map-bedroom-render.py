# Map Bedroom Pricing (Ken, 29 Oct 2026): the selected-development price block on the real Map page, desktop 1440 and phone 390.
#   python3 research/tests/map-bedroom-render.py
# Priced types keep their typical price, psf and count and link to Research on that type; "Matched sales only" types show their matched count
# and, opened one at a time, their latest matched resales (3 on a laptop, 2 on a phone), exactly Research's rows; transactions are fetched only
# when opened and only for the same data month; no typical price, psf or step for a matched-only type; prices by size stay where there is no
# priced type; View Full Research stays in view on a phone; nothing else on the Map changes.
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
def typ(dev, g): return next(t for t in ALL[dev]['resale']['types'] if t['g'] == g)
def priceM(v):
    import math
    return ('$%.2f' % (math.floor(v / 1e4 + 0.5) / 100)).rstrip('0').rstrip('.') + 'M' if v >= 1e6 else '$%dK' % math.floor(v / 1000 + 0.5)

def page(ctx, dev, tx_month=None):
    pg = ctx.new_page(); errs = []; req = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text and 'tile' not in m.text.lower() else None)
    pg.on('request', lambda r: req.append(r.url))
    if tx_month:
        def fake(route):
            j = json.loads((SITE / 'data/projects/tx/manifest.json').read_text()); j['latestMonth'] = tx_month; route.fulfill(status=200, body=json.dumps(j), headers={'content-type': 'application/json'})
        pg.route(re.compile(r'/data/projects/tx/manifest\.json'), fake)
    pg.goto(B + '/research/map/#p=' + dev, wait_until='domcontentloaded')
    pg.wait_for_selector('aside.dp .lead, aside.bs .lead', timeout=20000); pg.wait_for_timeout(1200)
    return pg, errs, req
def text(pg, sel): return pg.inner_text(sel) if pg.locator(sel).count() else ''
def cnt(pg, sel): return pg.locator(sel).count()
def opened(pg): return pg.eval_on_selector_all('[data-ldb-rc]', 'e => e.map(x => x.dataset.ldbRc)')
def rows_ok(pg, dev, g, k):   # the opened rows are exactly the first k of Research's "See the N matched resales" (GW_REC.matchedRows), checked by assertMatchedRows
    return pg.evaluate("""async ([id, g, k]) => { const P = window.KPT_PROJECT, tm = await (await fetch('../../data/projects/tx/manifest.json')).json();
      const sh = await (await fetch('../../data/projects/tx/' + P.shardName(P.shardOf(id, tm.shards)) + '.json')).json(), man = await (await fetch('../../data/projects/manifest.json')).json();
      const rec = GW_REC.pick(sh, tm, id, man), rows = GW_REC.matchedRows(rec, g, k), ul = document.querySelector('[data-ldb-rc="' + g + '"] .gwr-mrows');
      if (!ul) return 'no list'; try { return GW_BED.assertMatchedRows(ul.outerHTML, rows) && rows.length; } catch (e) { return e.message; } }""", [id_of(dev), g, k])
def id_of(dev): return dev
def view_full(pg):
    return pg.evaluate("() => { const a = document.querySelector('aside [data-m-full]'); if (!a) return null; const r = a.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }")

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw, mob in [('desktop', dict(viewport={'width': 1440, 'height': 900}), False), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True), True)]:
            print('==', vn); k = 2 if mob else 3
            # 1. Bartley Ridge: a priced 1-bedroom, matched-only 2- and 3-bedroom
            ctx = b.new_context(**kw); dev = 'bartley-ridge'; t1 = typ(dev, '1')
            pg, errs, req = page(ctx, dev)
            lead = text(pg, '[data-lead="beds"]')
            ok(lead.upper().startswith('RESALE PRICES BY BEDROOM'), vn + ': the block is "Resale prices by bedroom" when it mixes priced and matched-only types', lead[:60])
            ok(priceM(t1['price'][2]) in lead and 'typical' in lead and ('$%s psf' % format(t1['psf'][2], ',')) in lead and (mob or ('%d sales' % t1['n']) in lead), vn + ': the priced type keeps its typical price, psf and count, labelled typical', lead[:200])
            lk = pg.eval_on_selector_all('[data-lead="beds"] a[data-m-bed]', 'e => e.map(x => [x.dataset.mBed, x.getAttribute("href"), x.innerText])')
            ok(['1', '../#/p/bartley-ridge', 'Research ›'] in lk and cnt(pg, '[data-m-full]') == 1, vn + ': the priced type links to its Research', lk)
            rows = pg.eval_on_selector_all('[data-ldb-mo]', 'e => e.map(x => [x.dataset.ldbMo, x.innerText.replace(/\\s+/g, " ").trim()])')
            ok([r[0] for r in rows] == ['2', '3'] and all('Matched sales only' in r[1] for r in rows), vn + ': the matched-only types, tagged', rows)
            ok(all(('%d sales in 2 yrs' % mo(dev, r[0])['n24']) in r[1] for r in rows), vn + ': each with its matched count')
            ok(not any(re.search(r'psf|typical|median|average|vs ', r[1]) for r in rows), vn + ': no psf, typical price, statistic or step on a matched-only row', rows)
            # refinement (Ken 11:25): the collapsed row shows the latest matched resale itself, its full URA price and month, labelled a single sale
            last = pg.evaluate("""async (id) => { const P = window.KPT_PROJECT, tm = await (await fetch('../../data/projects/tx/manifest.json')).json();
              const sh = await (await fetch('../../data/projects/tx/' + P.shardName(P.shardOf(id, tm.shards)) + '.json')).json(), man = await (await fetch('../../data/projects/manifest.json')).json();
              const rec = GW_REC.pick(sh, tm, id, man); return ['2', '3'].map((g) => { const r = GW_REC.matchedRows(rec, g, 1)[0]; return [g, '$' + r[4].toLocaleString('en-US'), GW_REC.ymLabel(r[0])]; }); }""", dev)
            shown = pg.eval_on_selector_all('[data-ldb-mo] .ldb-ls', 'e => e.map(x => x.innerText.replace(/\\s+/g, " ").trim())')
            ok(shown == ['%s latest sale, %s' % (x[1], x[2]) for x in last], vn + ': each matched-only row shows its latest matched resale, full price and month, labelled "latest sale"', (shown, last))
            ok(opened(pg) == [] and sum(1 for u in req if '/data/projects/tx/s' in u and u.count('?v=2026')) == 1, vn + ': collapsed by default; the one transaction file fetched with the card')
            ok(view_full(pg), vn + ': View Full Research in view')
            nmark = pg.evaluate("document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length")
            pg.click('[data-bx="3"]'); pg.wait_for_selector('[data-ldb-rc="3"] .gwr-mrows', timeout=10000); pg.wait_for_timeout(300)
            ok(opened(pg) == ['3'] and sum(1 for u in req if '/data/projects/tx/s' in u and u.count('?v=2026')) == 1, vn + ': opening uses the same file (no second fetch)', [u for u in req if '/tx/' in u])
            ok(rows_ok(pg, dev, '3', k) == k, vn + ': the %d latest matched 3-bedroom resales, exactly Research’s first rows' % k, rows_ok(pg, dev, '3', k))
            rc = text(pg, '[data-ldb-rc="3"]')
            ok('Individual sales, newest first, not a typical price.' in rc and '19 other resales here could also be 3-bedroom' in rc and 'See the 14 matched resales in Research' in rc, vn + ': labelled individual sales, with the not-every-sale line and the full list', rc)
            ok(not re.search(r'psf|median|average|typical price\b(?! or)', rc.replace('not a typical price', '')), vn + ': no psf or statistic among them', rc)
            ok(pg.evaluate("document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length") == nmark, vn + ': the map’s markers are untouched')
            ok(view_full(pg), vn + ': View Full Research still in view with sales open')
            pg.click('[data-bx="2"]'); pg.wait_for_timeout(500)
            n_tx = sum(1 for u in req if '/data/projects/tx/s' in u and 'manifest' not in u and u.count('?v=2026'))   # the card's own fetches (the test's checks fetch without a version)
            ok(opened(pg) == ['2'] and rows_ok(pg, dev, '2', k) == k and n_tx == 1, vn + ': one type open at a time; the file is not fetched again', (opened(pg), rows_ok(pg, dev, '2', k), n_tx))
            pg.click('[data-bx="2"]'); pg.wait_for_timeout(300)
            ok(opened(pg) == [], vn + ': and it closes')
            # the link opens Research on that type (the V2.1 panel)
            pg.click('[data-bx="3"]'); pg.wait_for_selector('[data-ldb-rc="3"] a[data-m-bed]')
            pg.click('[data-ldb-rc="3"] a[data-m-bed]'); pg.wait_for_selector('[data-gwb-matched]', timeout=20000); pg.wait_for_timeout(600)
            ok(pg.get_attribute('[data-gwb-matched]', 'data-gwb-g') == '3' and '14 resales in the last 2 years were matched as 3-bedroom.' in text(pg, '[data-gwb-matched]'), vn + ': "See the 14 matched resales in Research" opens Research on 3-bedroom')
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
            ctx = b.new_context(**kw); pg, errs, req = page(ctx, dev)
            pg.click('[data-lead="beds"] a[data-m-bed="1"]'); pg.wait_for_selector('[data-gwb-ans]', timeout=20000)
            ok(pg.get_attribute('[data-gwb-ans]', 'data-gwb-g') == '1', vn + ': the priced type’s Research link opens its answer')
            ctx.close()
            # 2. a different data month: no rows, the link only
            ctx = b.new_context(**kw); pg, errs, req = page(ctx, dev, tx_month='2026-06')
            pg.click('[data-bx="3"]'); pg.wait_for_timeout(1500)
            ok(cnt(pg, '[data-ldb-rc="3"] .gwr-mrows') == 0 and 'aren’t available here' in text(pg, '[data-ldb-rc="3"]') and cnt(pg, '[data-ldb-rc="3"] a[data-m-bed="3"]') == 1 and cnt(pg, '[data-ldb-last]') == 0, vn + ': transactions from another data month are never shown beside these figures (no rows, no latest sale)')
            ctx.close()
            # 3. only priced types (Treasure at Tampines): as before, plus the Research links
            ctx = b.new_context(**kw); dev = 'treasure-at-tampines'; pg, errs, req = page(ctx, dev)
            lead = text(pg, '[data-lead="beds"]')
            ok(lead.upper().startswith('TYPICAL PRICES · RESALES, LAST 12 MONTHS') and cnt(pg, '[data-ldb-mo], .ldb-ty, [data-lead="beds-mo"]') == 0, vn + ': no matched-only type: the block and its wording as before', lead[:80])
            ok(cnt(pg, '[data-lead="beds"] a[data-m-bed]') == min(len(ALL[dev]['resale']['types']), 3 if mob else 4), vn + ': each priced type links to Research')
            ok(not any('/data/projects/tx/' in u for u in req), vn + ': no matched-only type: no transaction file fetched')
            if not mob: ok('+$340K vs 1-bedroom' in lead, vn + ': the step between two priced types is unchanged', lead)
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
            # 4. no bedroom data (Kent Ridge Hill Residences): prices by size, unchanged
            ctx = b.new_context(**kw); pg, errs, req = page(ctx, 'kent-ridge-hill-residences')
            ok(cnt(pg, '[data-lead="sizes"]') == 1 and cnt(pg, '[data-lead="beds"], [data-lead="beds-mo"]') == 0 and not any('/data/projects/tx/' in u for u in req), vn + ': no bedroom data: prices by size, as before, and nothing more fetched')
            ok(view_full(pg) and not errs, vn + ': View Full Research in view; no script errors', errs[:2]); ctx.close()
            # 5. matched-only types and no priced type (Kovan Melody): prices by size first, then the matched-only types
            ctx = b.new_context(**kw); dev = 'kovan-melody'; pg, errs, req = page(ctx, dev)
            leads = pg.eval_on_selector_all('aside .lead', 'e => e.map(x => x.dataset.lead || "")')
            ok(leads[:2] == ['sizes', 'beds-mo'], vn + ': prices by size stay first, matched-only types under them', leads)
            ok(pg.eval_on_selector_all('[data-ldb-mo]', 'e => e.map(x => x.dataset.ldbMo)') == ['2', '3', '4'], vn + ': its three matched-only types')
            ok(view_full(pg), vn + ': View Full Research in view on the taller card')
            pg.click('[data-bx="4"]'); pg.wait_for_selector('[data-ldb-rc="4"] .gwr-mrows', timeout=10000)
            ok(rows_ok(pg, dev, '4', k) == min(k, mo(dev, '4')['n24']), vn + ': its 4-bedroom sales (n24 = 3)', rows_ok(pg, dev, '4', k))
            ok(view_full(pg) and not pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1'), vn + ': still in view; no sideways scroll')
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
        b.close()
finally:
    srv.terminate()
print('map-bedroom-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
