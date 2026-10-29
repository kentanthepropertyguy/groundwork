# "Matched sales only" bedroom types (V2, Ken 27 Oct 2026; Claude C's handover section 6, UI tests 17, 20, 21, 23, 24, 26, 27).
# The real Research page, desktop 1440 and phone 390, on Bartley Ridge, Waterbank at Dakota and Kovan Melody (no figured type).
#   python3 research/tests/bedroom-matched-render.py
import json, os, pathlib, re, socket, subprocess, time, urllib.parse
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
FIG3 = next(i for i in sorted(ALL) if any(t['g'] == '3' for t in ALL[i]['resale']['types']))
NONE3 = next(i for i in sorted(ALL) if ALL[i]['resale']['types'] and not any(m['g'] == '3' for m in ALL[i]['resale'].get('matched', [])) and not any(t['g'] == '3' for t in ALL[i]['resale']['types']))
SPY = """window.__calls=[]; ['answerHtml','trendHtml','numbersHtml','finding','typical','budgetText','sizeText'].forEach(k=>{const f=GW_BED[k]; GW_BED[k]=function(){window.__calls.push(k); return f.apply(this,arguments)}});
 if (window.GW_PULSE) ['html','bedroomText'].forEach(k=>{const f=GW_PULSE[k]; if(f) GW_PULSE[k]=function(){window.__calls.push('pulse.'+k); return f.apply(this,arguments)}});"""
def page(ctx, dev, pre=None):
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
    pg.route('**/*googletagmanager*', lambda r: r.fulfill(status=200, body=''))
    # Pricing tiers r2 (29 Oct 2026): this suite keeps testing the V2 / V2.1 rules on bedroom-research-v1.2 data, so the r2 keys (groups, other,
    # range) are taken out of the shards it is served (also r2 test 14 on the page); research/tests/bedroom-tiers-render.py tests the tiers.
    def v12(route):
        r = route.fetch(); d = r.json()
        for v in d.get('projects', {}).values():
            for m in (v.get('resale') or {}).get('matched', []):
                for k in ('groups', 'other', 'range'): m.pop(k, None)
        route.fulfill(response=r, body=json.dumps(d), headers={**r.headers, 'content-type': 'application/json'})
    pg.route(re.compile(r'/data/projects/bedroom/s\d+\.json'), v12)
    if pre is not None: pg.add_init_script('(() => { try { ' + pre + ' } catch (e) {} })()')
    pg.goto(B + '/research/#/p/' + dev); pg.wait_for_selector('#lgPick'); pg.wait_for_timeout(450)
    pg.evaluate("window.__ev=[]; if (window.KPT) { const t = KPT.track; KPT.track = (n, p) => { window.__ev.push([n, p]); try { t(n, p); } catch (e) {} }; }")
    return pg, errs
def click(pg, sel): pg.evaluate("s => document.querySelector(s).click()", sel); pg.wait_for_timeout(450)
def text(pg, sel): return pg.inner_text(sel) if pg.locator(sel).count() else ''
def cnt(pg, sel): return pg.locator(sel).count()
def wa(pg, sel): return urllib.parse.unquote(pg.get_attribute(sel, 'href') or '') if cnt(pg, sel) else ''
PRICED = '[data-gwb-ans], [data-gwb-trend], [data-gwb-numbers], [data-gwb-budget], .gwr-rentline, [data-mp], [data-lg-ov], [data-gwb-size], [data-gwb-range]'
def copy_ok(pg, dev, g):   # V2.1: the panel's sentences (the sales list is checked on its own, rows_ok)
    t = pg.evaluate("() => { const p = document.querySelector('[data-gwb-matched]').cloneNode(true); p.querySelectorAll('[data-gwb-mrows]').forEach((x) => x.remove()); document.body.appendChild(p); const t = p.innerText; p.remove(); return t; }")
    return pg.evaluate("([t, r]) => { try { return GW_BED.assertMatchedOnlyCopy(t, r); } catch (e) { return e.message; } }", [t.replace('\n', ' '), dict(mo(dev, g), of=ALL[dev]['resale']['of'], unknown=ALL[dev]['resale']['unknown'])])
def rows_ok(pg, g):   # V2.1: the list is exactly the first sales of "See the N matched resales", newest first
    return pg.evaluate("""(g) => { const el = document.querySelector('[data-gwb-mrows]'); if (!el) return 'no list';
      const st = document.querySelector('#lgTx') ? document.querySelector('[data-lg="project"]').parentElement.__gwrSt : null; const rec = st && st.rec; if (!rec) return 'no transactions';
      const rows = GW_REC.matchedRows(rec, g, GW_BED.MATCHED_ROWS); try { return GW_BED.assertMatchedRows(el.outerHTML, rows) && rows.length; } catch (e) { return e.message; } }""", g)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))]:
            print('==', vn)
            # 16/17/26. Bartley Ridge: the chips; choosing the matched-only 3-bedroom draws the counts panel and nothing priced
            ctx = b.new_context(**kw); dev = 'bartley-ridge'; m3 = mo(dev, '3')
            pg, errs = page(ctx, dev)
            chips = pg.eval_on_selector_all('[data-bed]', 'e => e.map(x => [x.dataset.bed, x.dataset.gwbTier || "", x.getAttribute("aria-label") || "", x.innerText.replace(/\\s+/g, " ").trim()])')
            ok(chips == [['1', '', '', '1-bedroom'], ['2', 'matched', '2-bedroom, matched sales only', '2-bedroom Matched sales only'], ['3', 'matched', '3-bedroom, matched sales only', '3-bedroom Matched sales only']], vn + ': figured and matched-only chips, the tag visible', chips)
            ok(cnt(pg, '[data-lg-ov]') == 1 and cnt(pg, '[data-gwb-matched]') == 0, vn + ': nothing chosen: the overview, no panel')
            pg.evaluate(SPY)
            click(pg, '[data-bed="3"]')
            ok(cnt(pg, '[data-gwb-matched]') == 1 and pg.get_attribute('[data-bed="3"]', 'aria-pressed') == 'true', vn + ': the matched panel replaces the answer')
            ok(cnt(pg, PRICED) == 0, vn + ': no answer, price movement, numbers block, budget, rent, size or overview for a matched-only type', [pg.eval_on_selector_all(PRICED, 'e => e.map(x => x.outerHTML.slice(0, 80))')])
            ok(cnt(pg, '.lg-numgrid svg, .lg-numgrid canvas, [data-gwb-matched] svg') == 0, vn + ': no chart')
            ok(pg.evaluate('window.__calls') == [], vn + ': no figure function is called (spy)', pg.evaluate('window.__calls'))
            ok(copy_ok(pg, dev, '3') is True, vn + ': the panel passes assertMatchedOnlyCopy', copy_ok(pg, dev, '3'))
            ok(rows_ok(pg, '3') == 5, vn + ': V2.1: the latest 5 matched resales, exactly the first sales of the full list', rows_ok(pg, '3'))
            ok(text(pg, '[data-gwb-matched] [data-gwr-mbed]') == 'See the 14 matched resales', vn + ': the button names the full list', text(pg, '[data-gwb-matched] [data-gwr-mbed]'))
            pt = text(pg, '[data-gwb-matched]')
            ok('14 resales in the last 2 years were matched as 3-bedroom.' in pt and '19 other resales here could also be 3-bedroom' in pt and 'no typical price or price movement is shown' in pt, vn + ': the fixture counts on the page', pt[:200])
            run = text(pg, '[data-lg-run-line]') if pg.locator('[data-lg-run-line]').count() and pg.locator('[data-lg-run-line]').is_visible() else ''
            ok('$' not in run and '$' not in wa(pg, '#wa') and '$' not in wa(pg, '#waOwn') and 'typical' not in wa(pg, '#wa'), vn + ': no price in Run the numbers or either WhatsApp message', (run[:80], wa(pg, '#wa')[:160]))
            ev = [e for e in pg.evaluate('window.__ev') if e[0] == 'research_bedroom_selected']
            ok(ev and ev[-1][1] == {'project_id': dev, 'bedroom': '3', 'sale_type': 'resale', 'tier': 'matched'}, vn + ': analytics: the type and tier "matched", nothing else', ev)
            ok(pg.inner_text('[data-lg-jctx]') == '3-bedroom' if cnt(pg, '[data-lg-jctx]') else True, vn + ': the shortcut bar names the type')
            # 20/21. See these sales: bed 3, resales, last 2 years; the list is n24 long; the notice counts N and M
            click(pg, '[data-gwb-matched] [data-gwr-mbed]'); pg.wait_for_timeout(700)
            f = pg.evaluate("Object.fromEntries([...document.querySelectorAll('#lgTx [data-gwr-f]')].map(s => [s.dataset.gwrF, s.value]))")
            ok(f['bed'] == '3' and f['sale'] == '3' and f['period'] == '24' and f['bin'] == 'all', vn + ': See these sales sets 3-bedroom, resales, last 2 years', f)
            ok(pg.get_attribute('[data-gwr-count]', 'data-gwr-count') == str(m3['n24']), vn + ': the list has exactly n24 sales', pg.get_attribute('[data-gwr-count]', 'data-gwr-count'))
            note = text(pg, '[data-gwr-bednote]'); M = int(pg.get_attribute('[data-gwr-bednote]', 'data-m'))
            ok(note == 'Showing the 14 sales matched as 3-bedroom. %d other sales here could not be matched to a bedroom count and may include more.' % M and M == ALL[dev]['resale']['unknown'], vn + ': the Transactions notice (unknown resales, last 2 years)', note)
            top = pg.evaluate("document.getElementById('lgTx').getBoundingClientRect().top")
            ok(-5 < top < 200, vn + ': it scrolls to the Transactions', top)
            pg.select_option('#lgTx [data-gwr-f="period"]', 'all'); pg.wait_for_timeout(300)
            n_all = int(pg.get_attribute('[data-gwr-count]', 'data-gwr-count')); note2 = text(pg, '[data-gwr-bednote]')
            ok(note2.startswith('Showing the %d sale' % n_all), vn + ': the notice follows the other filters', note2)
            # 22. What each home type sells for: figured row, the Also matched line
            also = text(pg, '[data-gwr-also]')
            ok(cnt(pg, '#lgTypes [data-gwr-bed]') == 1 and also == 'Also matched (matched sales only): 2-bedroom 23, 3-bedroom 14', vn + ': figured rows only, and one Also matched line', also)
            pg.evaluate("window.scrollTo(0,0)"); click(pg, '[data-gwr-also] [data-gwr-mbed="2"]'); pg.wait_for_timeout(500)
            ok(pg.get_attribute('[data-gwr-count]', 'data-gwr-count') == str(mo(dev, '2')['n24']), vn + ': its 2-bedroom link opens the 2-bedroom matched sales')
            # 23. toggle and Clear; figured choice; across developments
            pg.evaluate("window.scrollTo(0,0)"); click(pg, '[data-bed="3"]')
            ok(cnt(pg, '[data-gwb-matched]') == 0 and cnt(pg, '[data-lg-ov]') == 1, vn + ': choosing it again clears it')
            click(pg, '[data-bed="2"]'); click(pg, '#bedClear')
            ok(cnt(pg, '[data-gwb-matched]') == 0 and cnt(pg, '[data-lg-ov]') == 1, vn + ': Clear returns to the overview')
            click(pg, '[data-bed="1"]')
            ev = [e for e in pg.evaluate('window.__ev') if e[0] == 'research_bedroom_selected']
            ok(cnt(pg, '[data-gwb-ans]') == 1 and cnt(pg, '[data-gwb-matched]') == 0 and ev[-1][1].get('tier') == 'figures', vn + ': a figured type keeps its answer, tier "figures"', ev[-1:])
            ok(not errs, vn + ': no script errors', errs[:2])
            ctx.close()
            for d2, want in [('waterbank-at-dakota', 'matched'), (FIG3, 'figures'), (NONE3, 'missing')]:
                ctx = b.new_context(**kw); pg, errs = page(ctx, d2, "sessionStorage.setItem('kpt.research.bed','3')")
                got = 'matched' if cnt(pg, '[data-gwb-matched]') else 'figures' if cnt(pg, '[data-gwb-ans]') else 'missing' if 'No reliable 3-bedroom figures here' in text(pg, '[data-gwb-line]') else '?'
                ok(got == want, vn + ': 3-bedroom kept from another development: ' + d2 + ' shows ' + want, got)
                if d2 == 'waterbank-at-dakota':
                    ok(copy_ok(pg, d2, '3') is True and '10 resales in the last 2 years were matched as 3-bedroom.' in text(pg, '[data-gwb-matched]') and rows_ok(pg, '3') == 5, vn + ': Waterbank 3-bedroom panel, with its latest 5 matched resales')
                    f = pg.evaluate("Object.fromEntries([...document.querySelectorAll('#lgTx [data-gwr-f]')].map(s => [s.dataset.gwrF, s.value]))")
                    ok(f.get('bed') == '3', vn + ': the Transactions start on the type chosen above', f)
                ok(not errs, vn + ': ' + d2 + ' no script errors', errs[:2]); ctx.close()
            # 24. a development with matched types and no figured type; size-first mode unchanged
            ctx = b.new_context(**kw); dev = 'kovan-melody'; pg, errs = page(ctx, dev)
            ok(text(pg, '#lgPickH') == 'How many bedrooms?' and pg.eval_on_selector_all('[data-bed]', 'e => e.map(x => x.dataset.bed + (x.dataset.gwbTier || ""))') == ['2matched', '3matched', '4matched'], vn + ': no figured type: matched-only chips only')
            ok(cnt(pg, '[data-gwb-few]') == 0, vn + ': its 4-bedroom (3 matched) is a chip, not a "too few" line')
            ok(cnt(pg, '#lgTypes [data-gwr-bed]') == 0 and 'What each size sells for' in text(pg, '#lgTypesH'), vn + ': prices by size, as before (no figured type)', text(pg, '#lgTypesH'))
            click(pg, '[data-bed="4"]')
            ok(cnt(pg, '[data-gwb-matched]') == 1 and 'There are too few matched sales to show a typical price or price movement.' in text(pg, '[data-gwb-matched]') and copy_ok(pg, dev, '4') is True, vn + ': its panel (few)')
            ok(rows_ok(pg, '4') == 3, vn + ': n24 = 3: all 3 matched resales listed', rows_ok(pg, '4'))
            click(pg, '[data-bed="4"]')
            pg.click('[data-gwb-area]'); pg.wait_for_selector('#gwbArea:not([hidden]) #sizeSel')
            v = pg.evaluate("(()=>{const o=[...document.querySelectorAll('#sizeSel optgroup option')];return o[0]&&o[0].value})()")
            pg.select_option('#sizeSel', v); pg.wait_for_timeout(450)
            ok(text(pg, '#lgPickH') == 'What size home are you looking at?' and cnt(pg, '[data-gwb-matched]') == 0 and cnt(pg, '[data-gwb-switch]') == 1, vn + ': size-first: the size question, with the way back to bedrooms')
            ok(not errs, vn + ': no script errors', errs[:2]); ctx.close()
            # 27. 390: no sideways scroll, no clipped chip
            if vn == 'phone':
                for dev in ['waterbank-at-dakota', 'bartley-ridge']:
                    ctx = b.new_context(**kw); pg, errs = page(ctx, dev)
                    for g in ['', '2', '3']:
                        if g: click(pg, '[data-bed="%s"]' % g)
                        geo = pg.evaluate("""() => { const vw = document.documentElement.clientWidth; return { over: document.documentElement.scrollWidth > vw + 1,
                          chips: [...document.querySelectorAll('.gwb-chips button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), b.scrollWidth > b.clientWidth + 1]; }), vw,
                          panel: (() => { const p = document.querySelector('[data-gwb-matched]'); if (!p) return null; const r = p.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), [...p.querySelectorAll('*')].some(x => x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).overflow !== 'visible')]; })() }; }""")
                        ok(not geo['over'] and all(c[0] >= 0 and c[1] <= geo['vw'] and not c[2] for c in geo['chips']) and (geo['panel'] is None or (geo['panel'][0] >= 16 and geo['panel'][1] <= geo['vw'] - 16 and not geo['panel'][2])), 'phone 390: ' + dev + (' ' + g + '-bedroom' if g else '') + ': no overflow, every chip whole', geo)
                    ok(not errs, 'phone: ' + dev + ' no script errors', errs[:2]); ctx.close()
        b.close()
finally:
    srv.terminate()
print('bedroom-matched-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
