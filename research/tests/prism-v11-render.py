"""PRISM V1.1 r2 (GW-PRISM-V1.1-2026-11-03-A2) in a real browser at 1440, 390 and 195 px (200% zoom on a phone).
Run from the site folder:  python3 research/tests/prism-v11-render.py
 The five reports: Kingsford Waterbay (its V1 verdict page, with the r2 positions, evidence profile, yield and income), Hougang Central
   (V1 verdict page, income only), Thomson Three, Hundred Palms Residences and The Quinn (evidence-profile pages: no verdict). Every
   approved statement on the page verbatim; missing evidence named; Market observational (no rank); the surrounding-market definition with
   Supply and Market; sources with OneMap's attribution.
 Navigation: Property Data -> PRISM Analysis (the switch; no verdict line on a profile page) -> Back; Research's own search leads with a
   profile page; the landing lists all five; a dimension link (#/prism/<id>/s) opens that dimension.
 Fails closed in the browser (D5): a changed report, a changed or missing index.json, the previous A2 data left in place, a changed shard -> the V1 pages are exactly V1, and a profile page's address falls back to its Property Data.
 The Standard Reveal (Master Planning, 3 Nov 2026) on the three profile pages: approved headline, figures, periods, qualifications;
   the factual-summary fallback; the V1 Reveals unchanged.
 Never: a score, purchasing power, affordability or forecast wording; sideways scrolling; a script error."""
import hashlib, json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
import prism_detailed  # PRISM Research hero R1: these suites test the five dimensions, which are in Detailed
SITE = pathlib.Path(__file__).resolve().parents[2]
ok_n = fail_n = 0
def check(name, cond, info=''):
    global ok_n, fail_n
    if cond: ok_n += 1; print('  ok   ' + name)
    else: fail_n += 1; print('  FAIL ' + name + (' :: ' + str(info)[:300] if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
B = os.environ.get('LIVE') or f'http://127.0.0.1:{P}'
REP = {i: json.loads((SITE / f'data/prism/v1.1/reports/{i}.json').read_text()) for i in ['kingsford-waterbay', 'hougang-central', 'thomson-three', 'hundred-palms-residences', 'the-quinn']}
PROFILE = ['thomson-three', 'hundred-palms-residences', 'the-quinn']
A2_MANIFEST = (SITE / 'research/tests/fixtures/prism-v11-a2-manifest.json').read_text()
R2_INDEX = (SITE / 'research/tests/fixtures/prism-v11-r2-index.json').read_text()   # the r2 root live before r3 (rollback pairing)
NOOVER = 'document.documentElement.scrollWidth <= innerWidth + 1'
TXT = "s=>{const e=document.querySelector(s);return e?e.textContent.replace(/\\s+/g,' ').trim():''}"
BAD = re.compile(r'score\s*/?\s*100|/\s*100\b|purchasing|affordab|\bforecast', re.I)
def clean(t): return re.sub(r'There is no overall score\.|PRISM gives no overall score\.?|(nothing here is|not) a forecast', '', t)
def fresh(br, w, tamper=None):
    mob = w < 500; ctx = br.new_context(viewport={'width': w, 'height': {1440: 900, 390: 844, 195: 422}[w]}, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap'), lambda r: r.fulfill(status=200, body=''))
    for t in (tamper or []): pg.route(re.compile(t[0]), t[1])
    return ctx, pg, errs
def open_prism(pg, id):
    pg.goto(B + '/research/#/prism/' + id); pg.wait_for_selector('[data-gwp-page="' + id + '"]', timeout=30000); pg.wait_for_timeout(600)
    pg.click('[data-gwp-all="open"]'); pg.wait_for_timeout(300)
def dimtext(pg, k): return pg.evaluate(TXT, '#gwp-' + k)
def body(pg): return pg.evaluate(TXT, '[data-gwp-page]')
def hl(pg, k): return pg.evaluate(TXT, '#gwp-' + k + ' [data-gwp-headline]')
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w in [1440, 390, 195]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            for id, r in REP.items():
                open_prism(pg, id); t = body(pg)
                mode = pg.get_attribute('[data-gwp-page]', 'data-gwp-mode')
                check(f'{vn} {id}: {"evidence-profile page, no verdict" if id in PROFILE else "its V1 verdict page"}', (mode == 'profile' and pg.locator('.gwp-card').count() == 0) if id in PROFILE else (mode == 'assessment' and pg.locator('.gwp-card.gwp-open .gwp-vh').count() == 1), mode)
                for x in (r['peerComparison'] or {}).get('positions', []):
                    d = dimtext(pg, x['dimension'])
                    check(f'{vn} {id} {x["dimension"]}: "{x["bandLabel"]}", its period and statement verbatim', x['bandLabel'] in d and x['periodLabel'] in d and x['statement'] in d, d[-300:])
                if r.get('profile'):
                    miss = [l['measure'] for l in r['profile']['lines'] if l['statement'] not in dimtext(pg, l['panel']) or l['label'] not in dimtext(pg, l['panel'])]
                    check(f'{vn} {id}: all {len(r["profile"]["lines"])} profile lines in their dimension, label and statement verbatim', not miss, miss)
                    check(f'{vn} {id}: the profile rule and the comparison group ({r["profile"]["comparisonGroup"]["developments"]} developments)', r['profile']['rule'] in t and f'{r["profile"]["comparisonGroup"]["developments"]} developments' in pg.evaluate(TXT, '[data-gwp-group]'))
                    check(f'{vn} {id}: the surrounding-market definition with Supply and with Market', r['profile']['surroundingMarket'] in dimtext(pg, 'S') and r['profile']['surroundingMarket'] in dimtext(pg, 'M'))
                    mb = pg.evaluate(TXT, '#gwp-M [data-gwp-profile]')
                    check(f'{vn} {id}: Market observational: no rank, decile or peer label', not re.search(r'\brank|decile|(Above|Around|Below) peers', mb, re.I) and pg.locator('[data-gwp-v11="M"]').count() == 0 and 'Observed transactions, not a prediction.' in mb, mb[:200])
                    # Hundred Palms Residences: its future transport is amended (GW-FMRT-P1-AMEND-HPR-20261104-01); the others stay "not yet assessed"
                    ft = 'Upcoming on the Cross Island Line: Serangoon North MRT about 300 m (LTA target 2030) and Tavistock MRT about 1,370 m (LTA target 2030), both under construction.' if id == 'hundred-palms-residences' else 'Not yet assessed: needs official LTA evidence for planned stations.'
                    check(f'{vn} {id}: missing evidence named (unsold not available, future transport {"as amended" if id == "hundred-palms-residences" else "not yet assessed"}, known sites only)', all(s in t for s in ['Not available: unsold inventory has not been validated.', ft, 'Known sites only; not a complete pipeline.']))
                if r.get('rentalYield'):
                    rows = pg.locator('[data-gwp-yield] tbody tr').count()
                    check(f'{vn} {id}: gross rental yield, {len(r["rentalYield"]["bands"])} bands, with its caption', rows == len(r['rentalYield']['bands']) and r['rentalYield']['caption'] in dimtext(pg, 'M'))
                if r.get('householdIncome'):
                    h = r['householdIncome']
                    check(f'{vn} {id}: household income, {h["planningArea"]} planning area, "{h["context"]}"', pg.locator('[data-gwp-income]').count() == 1 and f'{h["planningArea"]} planning area' in dimtext(pg, 'M') and h['context'] in dimtext(pg, 'M'))
                check(f'{vn} {id}: no score, purchasing power, affordability or forecast wording', not BAD.search(clean(t)) and not re.search(r'\bscores?\b', clean(t), re.I), BAD.search(clean(t)))
                src = pg.evaluate(TXT, '[data-gwp-sources]')
                if r.get('profile'): check(f'{vn} {id}: sources include LTA, MOE, NEA, NParks and OneMap with its attribution', all(s in src for s in ['Land Transport Authority', 'Ministry of Education', 'National Environment Agency', 'National Parks Board', 'OneMap']) and 'Singapore Land Authority' in src, src[-200:])
                check(f'{vn} {id}: no sideways scroll, no script error', pg.evaluate(NOOVER) and not errs, errs[:2])
            # headlines (closed rows)
            open_prism(pg, 'kingsford-waterbay')
            check(f'{vn} KW: Price Position headline from r2, Market headline still V1', hl(pg, 'P') == '9.9% below its local comparablesLower relative price than most peers · Oct 2024–Sep 2026' and hl(pg, 'M').startswith('+2.3% same-size resale prices'), [hl(pg, 'P'), hl(pg, 'M')])
            check(f'{vn} KW: the Summary card is unchanged (verdict first) and holds nothing from r2', pg.locator('.gwp-card [data-gwp-v11], .gwp-card [data-gwp-profile]').count() == 0)
            open_prism(pg, 'hundred-palms-residences')
            check(f'{vn} HP: Resale headline names the settling wave; its explanation and the analytical proxy are in the panel', hl(pg, 'R').startswith('12.6 resales per 100 homes a year') and 'sustained activity settling' in hl(pg, 'R') and 'not an official MOP date' in dimtext(pg, 'R'), hl(pg, 'R'))
            open_prism(pg, 'thomson-three')
            check(f'{vn} TT: "In line with comparable condos"; Supply names the quiet area', 'In line with comparable condos' in hl(pg, 'P') and hl(pg, 'S').endswith('Quiet area'), [hl(pg, 'P'), hl(pg, 'S')])
            open_prism(pg, 'hougang-central')
            check(f'{vn} HC: income only (Market Demand); Price Position still "Not assessed"', pg.locator('[data-gwp-income]').count() == 1 and pg.locator('[data-gwp-yield], [data-gwp-profile], [data-gwp-v11="P"]').count() == 0 and 'Not assessed in this report' in hl(pg, 'P'))
            ctx.close()
        # the Standard Reveal (Master Planning, 3 Nov 2026) on the three evidence-profile pages, desktop, phone and 200% zoom. Since the buyer
        # explanation (Master Planning, 3 Nov 2026, V2) the Reveal heads the explanation card: kicker, headline and qualifications word for
        # word; its figures are the card figures, meaning first ("22.7% above comparable prices"), with their peer counts and periods
        RVX = {'hundred-palms-residences': ('High resale activity, but sustained activity is still settling', ['22.7% above', '12.6', '1.6 km', '0.8% fewer'], ['Settling: fewer than 12 months of resales', 'not an official MOP date', 'Observed, Oct 2024–Sep 2026', 'Oct 2025–Sep 2026', 'A position against comparables, not a valuation or a price change.', 'Higher than 45 of 46 similar developments']),
               'the-quinn': ('Resale activity is above most peers', ['2.2% below', '4.7', '520 m', '15% fewer'], ['Higher than 208 of 266 similar developments with a figure', 'Close to the price level of comparable condos nearby.', 'A position against comparables, not a valuation or a price change.', 'Oct 2024–Sep 2026']),
               'thomson-three': ('A relatively quiet surrounding resale market', ['0.7% above', '5.1', '190 m', '24.7% fewer'], ['thin market, not an advantage', 'Observed transactions, not a prediction.', 'Oct 2025–Sep 2026 against the year before', 'More nearby resales than 2 of 51 similar developments', '288 → 217'])}
        for w in [1440, 390, 195]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            for id, (head, figs, quals) in RVX.items():
                # V3: the quick read opens the page (with the Reveal kept visible); the V2 explanation is opened with "Explore full PRISM analysis"
                pg.goto(B + '/research/#/prism/' + id); pg.wait_for_selector('[data-gwp-quick]', timeout=30000)
                check(f'{vn} {id} V3: the quick read keeps the approved Reveal visible ("PRISM Reveal · {head}")', ('PRISM Reveal · ' + head) in re.sub(r'\s+', ' ', pg.text_content('[data-gwp-quick]')))
                pg.evaluate("(() => { const f = document.querySelector('#gwp-full'); if (f && f.hidden) document.querySelector('[data-gwp-full]').click(); })()"); pg.wait_for_selector('[data-gwp-reveal]', timeout=30000); pg.wait_for_timeout(500)   # open the full analysis (if not already open)
                rv = re.sub(r'\s+', ' ', pg.inner_text('[data-gwp-reveal]')).strip(); rvall = re.sub(r'\s+', ' ', pg.text_content('[data-gwp-reveal]')).strip()
                got = pg.evaluate("[...document.querySelectorAll('[data-gwp-reveal] .gwp-xf b')].map(b => b.textContent)")
                check(f'{vn} {id} Reveal: "PRISM Reveal", "{head}", then the explanation with figures {figs}', rv.lower().startswith(('PRISM Reveal ' + head).lower()) and head in rv and got == figs, [rv[:120], got])
                check(f'{vn} {id} Reveal: its periods, peer counts and qualifications', all(q in rvall for q in quals), [q for q in quals if q not in rvall])
                check(f'{vn} {id} Reveal: nothing unsupported (no verdict, recommendation, prediction, score, Ken\'s Take)', not re.search(r'verdict|recommend|\bbuy\b|invest|forecast|predict(?!ion\.)|score|undervalued|ken.s take|older', rv, re.I), rv)
                order = pg.evaluate("(() => { const q = document.querySelector('[data-gwp-quick]').getBoundingClientRect(), r = document.querySelector('[data-gwp-reveal]').getBoundingClientRect(), d = document.querySelector('#gwpDimsH').getBoundingClientRect(), s = document.querySelector('#gwp-sum').getBoundingClientRect(); return [s.top <= q.top, q.bottom <= r.top, r.bottom <= d.top]; })()")
                check(f'{vn} {id}: the quick read opens the page; the full analysis (with the Reveal) follows it, before the five dimensions', all(order), order)
                tops = pg.evaluate("[...document.querySelectorAll('[data-gwp-reveal] .gwp-xf')].map(f => Math.round(f.getBoundingClientRect().top))")
                rows = len(set(tops)); want_rows = 1 if w >= 1024 else 2 if w >= 360 else len(tops)
                check(f'{vn} {id} explanation layout: {"four figures in one row" if w >= 1024 else "a 2 x 2 grid" if w >= 360 else "one column"}', rows == want_rows, tops)
                check(f'{vn} {id} Reveal: no sideways scroll, no script error', pg.evaluate(NOOVER) and not errs, errs[:2])
                ov = pg.evaluate("[...document.querySelectorAll('[data-gwp-reveal] .gwp-xf')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id} Reveal: every figure fits its box (no words running past it)', all(x <= 1 for x in ov), ov)
            # the factual summary (fallback), drawn by the page itself from Thomson Three's model with its quiet flag cleared
            pg.goto(B + '/research/#/prism/thomson-three'); pg.wait_for_selector('[data-gwp-full]', timeout=30000); pg.evaluate("(() => { const f = document.querySelector('#gwp-full'); if (f && f.hidden) document.querySelector('[data-gwp-full]').click(); })()"); pg.wait_for_selector('[data-gwp-reveal]', timeout=30000); pg.wait_for_timeout(400)
            fb = pg.evaluate("(() => { const v = JSON.parse(JSON.stringify(GW_PRISM._settled['thomson-three'].v11)); v.profile.lines.S.find(l => l.measure === 'supply.quietArea').data.flag = false; const x = GW_PRISM.reveal11(v); document.querySelector('[data-gwp-reveal]').outerHTML = GW_PRISM.revealHtml(x); return [x.kind, x.head]; })()")
            pg.wait_for_timeout(200); fbt = re.sub(r'\s+', ' ', pg.inner_text('[data-gwp-reveal]')).strip()
            check(f'{vn} fallback: a factual summary of the approved labels, labelled "PRISM summary", no approved headline', fb == ['summary', 'Price: In line with comparable condos · Resale activity: Around peers'] and fbt.lower().startswith('prism summary price: in line with comparable condos') and 'prism reveal' not in fbt.lower(), [fb, fbt[:120]])
            check(f'{vn} fallback summary: no sideways scroll', pg.evaluate(NOOVER))
            for id in ['kingsford-waterbay', 'hougang-central']:
                pg.goto(B + '/research/#/prism/' + id); pg.wait_for_selector('[data-gwp-page]', timeout=30000); pg.wait_for_timeout(400)
                check(f'{vn} {id}: its V1 Reveal in the verdict card, unchanged; no r2 Reveal', pg.locator('.gwp-card .gwp-rvl .gwp-ev').count() == 1 and pg.locator('[data-gwp-reveal]').count() == 0)
                ov = pg.evaluate("[...document.querySelectorAll('.gwp-rvl .gwp-fig')].map(f => f.scrollWidth - f.clientWidth)")
                check(f'{vn} {id}: its V1 Reveal figures fit their boxes', all(x <= 1 for x in ov), ov)
            ctx.close()
        # navigation
        for w in [1440, 390]:
            vn = f'{w}px'; ctx, pg, errs = fresh(br, w)
            pg.goto(B + '/research/#/p/hundred-palms-residences'); pg.wait_for_selector('[data-gwp-switch]', timeout=30000); pg.wait_for_timeout(600)
            check(f'{vn} HP Property Data: the PRISM Analysis tab, no verdict line', pg.locator('[data-gwp-switch] [data-gwp-view="prism"]').count() == 1 and pg.locator('[data-gwp-preview]').count() == 0)
            pg.click('[data-gwp-switch] [data-gwp-view="prism"]'); pg.wait_for_selector('[data-gwp-page="hundred-palms-residences"]', timeout=20000)
            check(f'{vn} … opens its PRISM Analysis', pg.url.endswith('#/prism/hundred-palms-residences'))
            pg.go_back(); pg.wait_for_selector('[data-gwp-switch]', timeout=20000)
            check(f'{vn} … Back returns to its Property Data', pg.url.endswith('#/p/hundred-palms-residences'))
            pg.goto(B + '/research/'); pg.wait_for_selector('#q'); pg.fill('#q', ''); pg.click('#q'); pg.keyboard.type('the quinn', delay=25); pg.wait_for_selector('#res [data-id="the-quinn"]', timeout=20000); pg.keyboard.press('Enter')
            pg.wait_for_selector('[data-gwp-page="the-quinn"]', timeout=20000)
            check(f'{vn} Research search, The Quinn: leads with its PRISM evidence profile', pg.url.endswith('#/prism/the-quinn'))
            pg.goto(B + '/research/'); pg.wait_for_selector('[data-gwp-picks]:not([hidden])', timeout=20000)
            pk = [a.replace('›', '').strip() for a in pg.locator('[data-gwp-picks] a').all_inner_texts()]
            check(f'{vn} landing: "Explore a PRISM report" lists the five', pk == ['Kingsford Waterbay', 'Hougang Central', 'Thomson Three', 'Hundred Palms Residences', 'The Quinn'], pk)
            pg.goto(B + '/research/#/prism/the-quinn/s'); pg.wait_for_selector('[data-gwp-page="the-quinn"]', timeout=20000); pg.wait_for_timeout(900)
            check(f'{vn} a dimension link (#/prism/the-quinn/s) opens Supply Pressure', pg.locator('#gwpDimS').is_visible() and pg.locator('#gwpDimP').is_hidden())
            check(f'{vn} navigation: no script error', not errs, errs[:2]); ctx.close()
        # fails closed
        def body_of(r, f): resp = r.fetch(); r.fulfill(response=resp, body=f(resp.text()))
        IX = r'data/prism/v1\.1/index\.json'
        KWS = r'data/prism/v1\.1/index/' + hashlib.sha256(b'kingsford-waterbay').hexdigest()[0] + r'\.json'
        cases = [('a changed report (Kingsford Waterbay)', [(r'data/prism/v1\.1/reports/kingsford-waterbay\.json', lambda r: body_of(r, lambda t: t.replace('"observed": 6.4', '"observed": 7.4')))], 'kw'),
                 ('a changed index.json', [(IX, lambda r: body_of(r, lambda t: t.replace('"reports": 2099', '"reports": 2100')))], 'all'),
                 ('a missing index.json (the previous A2 data left in place has none)', [(IX, lambda r: r.fulfill(status=404, body=''))], 'all'),
                 ('the previous A2 manifest served as the index', [(IX, lambda r: r.fulfill(status=200, content_type='application/json', body=A2_MANIFEST))], 'all'),
                 ('a changed shard (Kingsford Waterbay\'s)', [(KWS, lambda r: body_of(r, lambda t: t.replace('"items": 17', '"items": 18')))], 'kw'),
                 ('the previous r2 root served as the index (data rolled back without the page)', [(IX, lambda r: r.fulfill(status=200, content_type='application/json', body=R2_INDEX))], 'all'),
                 ('a pending item in the Kingsford Waterbay report (r3: one item outside the approval rejects the report)', [(r'data/prism/v1\.1/reports/kingsford-waterbay\.json', lambda r: body_of(r, lambda t: t.replace('"state": "approved"', '"state": "pending"', 1)))], 'kw'),
                 ('a changed Hundred Palms report', [(r'data/prism/v1\.1/reports/hundred-palms-residences\.json', lambda r: body_of(r, lambda t: t.replace('12.6', '12.7')))], 'hp')]
        for name, tp, scope in cases:
            ctx, pg, errs = fresh(br, 1440, tp)
            if scope in ('kw', 'all'):
                open_prism(pg, 'kingsford-waterbay')
                check(f'fails closed, {name}: Kingsford Waterbay is exactly V1 (no r2 part; Price Position "Not assessed")', pg.locator('[data-gwp-v11],[data-gwp-profile],[data-gwp-yield],[data-gwp-income],[data-gwp-v11-src]').count() == 0 and 'Not assessed in this report' in hl(pg, 'P') and not errs, errs[:2])
            if scope in ('hp', 'all'):
                pg.goto(B + '/research/#/prism/hundred-palms-residences'); pg.wait_for_function("location.hash === '#/p/hundred-palms-residences'", timeout=20000); pg.wait_for_selector('header.lg-hero', timeout=30000); pg.wait_for_timeout(1200)
                check(f'fails closed, {name}: Hundred Palms has no PRISM page; its address falls back to Property Data, with no switch', pg.locator('[data-gwp-page]').count() == 0 and pg.locator('[data-gwp-switch]').count() == 0 and not errs, errs[:2])
            if scope == 'all':
                pg.goto(B + '/research/#/prism/thomson-three'); pg.wait_for_function("location.hash === '#/p/thomson-three'", timeout=20000); pg.wait_for_timeout(800)
                check(f'fails closed, {name}: Thomson Three has no PRISM page (as in V1)', pg.locator('[data-gwp-page]').count() == 0)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print('prism-v11-render: %d passed, %d failed' % (ok_n, fail_n))
raise SystemExit(1 if fail_n else 0)
