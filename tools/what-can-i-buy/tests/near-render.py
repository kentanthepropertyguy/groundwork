"""Browser checks for What can this budget buy? near a place (desktop and phone). Run from the site folder:  python3 tools/what-can-i-buy/tests/near-render.py
Starts the site's own local server, stubs the OneMap tiles (no internet needed) and drives the whole flow."""
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
SITE = pathlib.Path(__file__).resolve().parents[3]
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
ok = fail = 0
def check(name, cond, info=''):
    global ok, fail
    if cond: ok += 1; print('  ok   ' + name)
    else: fail += 1; print('  FAIL ' + name + (' :: ' + str(info) if info else ''))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(SITE / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
URL = f'http://127.0.0.1:{P}/tools/what-can-i-buy/'
# Every development with URA sales now has a position (URA's, or OneMap's: data/map/positions-onemap.json). To keep testing the "unplaced" list, the page is served the Map list as URA published it.
OM = {x[0] for x in json.load(open(SITE / 'data/map/positions-onemap.json'))['rows']}
def ura_only(r):
    d = json.loads(r.fetch().text())
    for row in d['rows']:
        if row[0] in OM: row[2] = row[3] = None
    r.fulfill(status=200, content_type='application/json', body=json.dumps(d))
def fresh(ctx):
    page = ctx.new_page(); errs = []; reqs = []
    page.on('pageerror', lambda e: errs.append(str(e))); page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.on('request', lambda r: reqs.append(r.url))
    page.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    page.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    page.route('**/data/map/places.json*', ura_only)
    return page, errs, reqs
def start(page, budget='1,800,000'):
    page.goto(URL); page.fill('#budgetInput', budget); page.click('#budgetGo'); page.wait_for_selector('#kpfNearQ', timeout=20000)
def pick(page, q, text):
    page.fill('#kpfNearQ', ''); page.type('#kpfNearQ', q, delay=5); page.wait_for_selector('.kpf-sg', timeout=15000)
    page.click(f'.kpf-sg:has-text("{text}")'); page.wait_for_selector('[data-f=nearr]', timeout=10000)
def rad(page, r):
    page.click(f'[data-f=nearr][data-r="{r}"]'); page.wait_for_function(f"document.querySelector('[data-f=nearr][aria-checked=true]').dataset.r === '{r}'")
cards = lambda page: page.eval_on_selector_all('#findRoot .kpf-card', 'els => els.map(e => e.dataset.pid)')
dists = lambda page: page.eval_on_selector_all('#findRoot .kpf-dist', 'els => els.map(e => e.innerText)')
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]:
        print(vn)
        ctx = br.new_context(**kw); pg, errs, reqs = fresh(ctx); start(pg)
        base = cards(pg)
        check(vn + ': without a location the islandwide search works and shows its usual lists', len(base) >= 3 and not pg.query_selector('.kpf-dist') and not pg.query_selector('#kpfMapSlot'), base)
        check(vn + ': the Map and Leaflet files have not been fetched yet', not any(re.search(r'leaflet|kpt-map|data/map/', u) for u in reqs), [u for u in reqs if re.search(r'leaflet|kpt-map|data/map/', u)][:3])
        # ambiguous: several roads/places match, so nothing is chosen for the buyer
        pg.type('#kpfNearQ', 'yio chu kang', delay=5); pg.wait_for_selector('.kpf-sg', timeout=15000)
        n = pg.eval_on_selector_all('.kpf-sg', 'els => els.length')
        sg = pg.eval_on_selector_all('.kpf-sg', 'els => els.map(e => e.innerText.replace(/\\n/g, " | "))')
        check(vn + ': no suggestion repeats a word ("Road | Road", "MRT | MRT station") or its area', not [x for x in sg if re.search(r'\b(\w+)\b[^|]*\|\s*\1\b', x, re.I)], sg)
        pg.press('#kpfNearQ', 'Enter')
        check(vn + ': an ambiguous place offers several suggestions and Enter does not pick one', n > 1 and not pg.query_selector('[data-f=nearr]'), n)
        pick(pg, 'yio chu kang road', 'Serangoon')
        pg.wait_for_selector('#kpfMapSlot .leaflet-container', timeout=15000)
        check(vn + ': the shared Map code was loaded only now', any('kpt-map-core' in u for u in reqs) and any('leaflet.js' in u for u in reqs))
        check(vn + ': a place is chosen and the radius defaults to 1 km', pg.eval_on_selector('[data-f=nearr][aria-checked=true]', 'e => e.dataset.r') == '1000')
        pg.evaluate("window.__keep = 1")
        seen = {}
        for r in ('500', '1000', '2000', '3000'):
            rad(pg, r); pg.wait_for_timeout(200)
            ids = cards(pg); ds = dists(pg); seen[r] = ids
            txt = pg.inner_text('.kpf-ncount') if pg.query_selector('.kpf-ncount') else ''
            m = re.match(r'(\d+) development', txt); shown = len(set(ids))
            check(vn + f': {r} m: the count line matches the list ({m.group(1) if m else 0} vs {shown})', (int(m.group(1)) if m else 0) == shown, txt)
            check(vn + f': {r} m: every card carries a straight-line distance within the radius', all('straight line' in d for d in ds) and len(ds) == len(ids))
        check(vn + ': changing the radius did not reload the page', pg.evaluate("window.__keep") == 1)
        check(vn + ': a wider radius never loses a development', set(seen['500']) <= set(seen['1000']) <= set(seen['2000']) <= set(seen['3000']), seen)
        circ = pg.evaluate("""() => [...document.querySelectorAll('#kpfMapSlot path.leaflet-interactive, #kpfMapSlot svg path')].filter(p => (p.getAttribute('stroke-dasharray') || '').length).length""")
        check(vn + ': the map shows the radius circle', circ >= 1, circ)
        check(vn + ': the map has its attribution', 'OneMap' in pg.inner_text('#kpfMapSlot .leaflet-control-attribution'))
        w = pg.evaluate("[document.documentElement.scrollWidth, innerWidth]")
        check(vn + ': no sideways scrolling', w[0] <= w[1], w)
        mh = pg.evaluate("document.querySelector('#kpfMapSlot').getBoundingClientRect().height")
        check(vn + ': the map is compact (' + str(round(mh)) + 'px)', mh <= (260 if vn == 'phone' else 380), mh)
        nt = pg.inner_text('#kpfNear')
        check(vn + ': the list says it rests on recent sales (and Huttons prices) and is not every home for sale now', 'recent sales' in nt and re.search(r'not a list of (every )?homes? for sale', nt, re.I), nt[-300:])
        hdr = pg.inner_text('.kpf-nwhere')
        check(vn + ': the place is named once, with no repeated type word ("Road Road")', not re.search(r'\b(\w+)\s+\1\b', hdr, re.I) and hdr.startswith('Within') and 'Yio Chu Kang Road' in hdr, hdr)
        sec = pg.eval_on_selector_all('#findRoot .kpf-other', 'els => els.map(e => e.dataset.kpfClass)')
        rad(pg, '3000'); sec = pg.eval_on_selector_all('#findRoot .kpf-other', 'els => els.map(e => e.dataset.kpfClass)')
        check(vn + ': the EC near Yio Chu Kang Road is in its own Executive Condominiums section, not among the condominiums', 'ec' in sec and 'hundred-palms-residences' in pg.eval_on_selector_all('#findRoot .kpf-other[data-kpf-class=ec] .kpf-card', 'els => els.map(e => e.dataset.pid)'), sec)
        # final pass: the map and the count agree, and developments with no verified position are listed apart
        n3 = int(re.match(r'(\d+)', pg.inner_text('.kpf-ncount')).group(1))
        dots = pg.evaluate("""() => { const s = new Set(); document.querySelectorAll('#kpfMapSlot path.leaflet-interactive').forEach(p => { const r = p.getBoundingClientRect(); s.add(Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2)); }); return s.size; }""")
        check(vn + ': the map draws one dot for every development counted, plus the place itself (' + str(dots) + ' vs ' + str(n3) + ')', dots == n3 + 1, (dots, n3))
        note = pg.inner_text('.kpf-nmiss') if pg.query_selector('.kpf-nmiss') else ''
        mnum = re.search(r'(\d+) more development', note)
        check(vn + ': the note says how many are on the map and that the others have no verified position, so no distance is claimed', mnum and ' on the map' in note and 'no verified map position' in note and 'See ' in note, note)
        check(vn + ': the note is short enough for a phone (under 260 characters)', 0 < len(note) < 260, len(note))
        # (i) help: the answer first; the method one hover (desktop) or tap (phone) away
        nin = pg.locator('#kpfNear .gwi').count(); nt = pg.inner_text('#kpfNear'); ntc = pg.text_content('#kpfNear')
        check(vn + ': the near-a-place block has only two (i) icons (distance method, why some have no position)', nin == 2, nin)
        check(vn + ': the long explanations are not printed: the count line shows the count and radius only', 'Straight-line distance from' not in nt and 'Straight-line distance from' in ntc and 'URA publishes no location' not in nt and 'URA publishes no location' in ntc and 'straight-line distance from' not in pg.inner_text('.kpf-ncount').lower(), pg.inner_text('.kpf-ncount'))
        check(vn + ': essential qualifications stay visible: no verified position, and past sales rather than a list of homes for sale', 'no verified map position' in nt and re.search(r'recent sales', nt, re.I) and re.search(r'not a list of', nt, re.I), nt[:300])
        g = pg.locator('#kpfNear .gwi').first; g.scroll_into_view_if_needed()
        if vn == 'desktop': g.hover()
        else: g.tap()
        pg.wait_for_selector('.gwi-tip', timeout=3000)
        tp = pg.evaluate("(() => { const t = document.querySelector('.gwi-tip').getBoundingClientRect(); return { l: t.left, r: t.right, t: t.top, b: t.bottom, w: innerWidth, h: innerHeight, x: document.querySelector('.gwi-tip').textContent }; })()")
        check(vn + ': ' + ('hovering' if vn == 'desktop' else 'tapping') + ' the first (i) explains how distances are measured, inside the screen', 'Straight-line distance from' in tp['x'] and tp['l'] >= 0 and tp['r'] <= tp['w'] and tp['t'] >= 0 and tp['b'] <= tp['h'], tp)
        pg.keyboard.press('Escape') if vn == 'desktop' else pg.touchscreen.tap(5, 5)
        pg.wait_for_function("!document.querySelector('.gwi-tip')", timeout=3000)
        check(vn + ': it closes again (' + ('Escape' if vn == 'desktop' else 'tap elsewhere') + ')', True)
        pg.click('.kpf-nmiss [data-f=unplaced]'); pg.wait_for_selector('#kpfUnplaced[open]', timeout=5000)
        total_unp = int(re.search(r'\((\d+)\)', pg.inner_text('#kpfUnplaced summary')).group(1))
        check(vn + ': the list of developments with no map position has the number the note gives', mnum and total_unp == int(mnum.group(1)), (total_unp, note))
        if total_unp > 8:
            check(vn + ': it shows the first six and offers the rest', pg.eval_on_selector_all('#kpfUnplaced .kpf-unl li', 'e => e.length') == 6)
            pg.click('#kpfUnplaced [data-f=unpall]'); pg.wait_for_function("document.querySelectorAll('#kpfUnplaced .kpf-unl li').length > 6")
        un = pg.eval_on_selector_all('#kpfUnplaced .kpf-unl li', 'e => e.map(x => x.innerText.split("\\n")[0])')
        cn = pg.eval_on_selector_all('#findRoot .kpf-card .kpf-name', 'e => e.map(x => x.innerText)')
        check(vn + ': every one is listed (' + str(len(un)) + ') and none is also a result card', len(un) == total_unp and not (set(un) & set(cn)), (un[:3], cn[:3]))
        check(vn + ': each says what it is and why it was matched, and none says it is inside the radius', all(re.search(r'(New launch|Resale)', x) for x in pg.eval_on_selector_all('#kpfUnplaced .kpf-unl li', 'e => e.map(x => x.innerText)')) and 'within' not in pg.inner_text('#kpfUnplaced .kpf-unl'))
        upt = pg.inner_text('.kpf-up') if pg.query_selector('.kpf-up') else ''
        check(vn + ': with a place chosen, launches and sites are never result cards (a register site with a verified position inside the radius is, with its distance, and is not a match)', not ({'Thomson Reserve', 'Hougang Central', 'Chencharu Close', 'The Serra Residences'} & set(cn)) and (not upt or (re.search(r'\d(\.\d)? km|\d+ m', upt) and 'not budget matches' in upt and not re.search(r'\$\s?\d', upt))), upt[:200])
        ext = pg.eval_on_selector_all('.kpf-upmore a', 'e => e.map(x => [x.target, x.rel, x.href, x.innerText])')
        check(vn + ': a discreet link browses other upcoming launches separately, in a new tab', len(ext) == 1 and ext[0][0] == '_blank' and 'noopener' in ext[0][1] and ext[0][2].startswith('https://') and 'upcoming launches' in ext[0][3], ext)
        # hide / show the map
        pg.click('[data-f=maptog]'); check(vn + ': the map can be hidden', not pg.query_selector('#kpfMapSlot')); pg.click('[data-f=maptog]'); pg.wait_for_selector('#kpfMapSlot .leaflet-container')
        # a dot on the map takes you to its card
        pg.evaluate("document.querySelectorAll('#kpfMapSlot path.leaflet-interactive')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))")
        pg.wait_for_selector('#findRoot .kpf-card.is-hl', timeout=5000)
        check(vn + ': a dot on the map highlights its card in the list', True)
        # zero results: a high budget in a tiny radius
        pg.click('[data-f=nearclear]'); pg.wait_for_selector('#kpfNearQ')
        check(vn + ': clearing the place returns to the islandwide list', cards(pg) == base and not pg.query_selector('.kpf-dist'), (cards(pg), base))
        check(vn + ': the upcoming launches still show without a place, with no distance claimed and no extra link', pg.query_selector('.kpf-up') and 'Thomson Reserve' in pg.inner_text('.kpf-up') and not pg.query_selector('#kpfUnplaced') and 'no verified map position' not in pg.inner_text('.kpf-up') and not pg.query_selector('.kpf-upmore'))
        # the saved place survives a reload of the page in this tab
        pick(pg, 'yio chu kang road', 'Serangoon'); rad(pg, '2000'); keep = cards(pg)
        pg.reload(); pg.wait_for_selector('[data-f=nearr]', timeout=20000); pg.wait_for_selector('#kpfMapSlot .leaflet-container', timeout=15000)
        check(vn + ': the place and radius are remembered in this tab', pg.eval_on_selector('[data-f=nearr][aria-checked=true]', 'e => e.dataset.r') == '2000' and cards(pg) == keep)
        # an MRT station and a neighbourhood work through the same box
        pg.click('[data-f=nearchange]'); pick(pg, 'bishan', 'Neighbourhood')
        check(vn + ': a neighbourhood can be chosen', 'Bishan' in pg.inner_text('.kpf-nwhere'), pg.inner_text('.kpf-nwhere'))
        pg.click('[data-f=nearchange]'); pick(pg, 'yio chu kang', 'MRT')
        check(vn + ': an MRT station can be chosen, named once', 'MRT' in pg.inner_text('.kpf-nwhere') and not re.search(r'\b(\w+)\s+\1\b', pg.inner_text('.kpf-nwhere'), re.I), pg.inner_text('.kpf-nwhere'))
        # nothing matches: a simple way forward
        pg.click('[data-f=nearchange]'); pick(pg, 'yio chu kang road', 'Serangoon'); rad(pg, '500')
        pg.wait_for_selector('.kpf-none', timeout=10000)
        z = pg.inner_text('.kpf-none')
        check(vn + ': a search with no match says so and suggests a wider radius or budget', 'within 500 m' in z and 'wider radius' in z, z[:200])
        check(vn + ': even then, developments with no map position are listed apart so none is hidden', pg.query_selector('#kpfUnplaced') is not None)
        # a launch with a verified position (supplied here through the launch list) is listed when inside the radius, and only then
        import json
        pg2, errs2, reqs2 = fresh(ctx)
        def sites(route):
            r = route.fetch(); d = json.loads(r.text())
            for x in d['sites']:
                if x['id'] == 'thomson-reserve': x['lat'] = 1.3557 + 0.0055; x['lon'] = 103.8758
            route.fulfill(response=r, body=json.dumps(d), headers={'content-type': 'application/json'})
        pg2.route(re.compile(r'data/research/sites\.json'), sites)
        start(pg2); pick(pg2, 'yio chu kang road', 'Serangoon'); rad(pg2, '1000')
        pg2.wait_for_selector('.kpf-up', timeout=10000); ut = pg2.inner_text('.kpf-up')
        check(vn + ': a launch with a verified position inside the radius is listed, with its straight-line distance', 'Thomson Reserve' in ut and 'Hougang Central' not in ut and 'straight line' in ut and 'not budget matches' in ut, ut[:240])
        rad(pg2, '500'); pg2.wait_for_function("!document.querySelector('.kpf-up')", timeout=10000)
        check(vn + ': outside the radius it is not listed, and the discreet link remains', pg2.query_selector('.kpf-upmore a') is not None and 'Thomson Reserve' not in pg2.inner_text('#findRoot'))
        # upcoming launches do not depend on the Huttons layer: missing, expired and fresh inventory
        for label, now, missing in [('missing', '2026-10-21', True), ('expired', '2026-11-30', False), ('fresh', '2026-10-08', False)]:
            pg3, errs3, reqs3 = fresh(ctx)
            if missing: pg3.route(re.compile(r'data/projects/inventory\.json'), lambda r: r.fulfill(status=404, body='not found'))
            pg3.goto(URL + '?now=' + now); pg3.fill('#budgetInput', '1,800,000'); pg3.click('#budgetGo'); pg3.wait_for_selector('#kpfNearQ', timeout=20000); pg3.wait_for_selector('.kpf-up', timeout=10000)
            up = pg3.inner_text('.kpf-up'); body = pg3.inner_text('#findRoot')
            check(vn + ': ' + label + ' Huttons inventory: upcoming possibilities are still listed, with no price claimed', 'Thomson Reserve' in up and 'Hougang Central' in up and 'not budget matches' in up, up[:200])
            check(vn + ': ' + label + ' Huttons inventory: ' + ('a launch with current Huttons prices is not repeated' if label == 'fresh' else 'a launch whose Huttons prices are out of date or unavailable is a possibility, not a match'), ('Lucerne Grand' not in up) if label == 'fresh' else ('Lucerne Grand' in up), up[:200])
            if label != 'fresh': check(vn + ': ' + label + ' Huttons inventory: no Huttons price is used for matching', 'From around' not in body, '')
            pick(pg3, 'yio chu kang road', 'Serangoon'); rad(pg3, '2000')
            pg3.wait_for_selector('.kpf-upmore a', timeout=10000)
            check(vn + ': ' + label + ' Huttons inventory: with a place chosen, no launch without a verified position is listed (a placed one may be), and the discreet link remains', 'Hougang Central' not in pg3.inner_text('#findRoot') and 'Thomson Reserve' not in pg3.inner_text('#findRoot') and pg3.query_selector('.kpf-upmore a') is not None, pg3.inner_text('#findRoot')[:120])
            check(vn + ': ' + label + ' Huttons inventory: no script errors', not [e for e in errs3 if 'favicon' not in e and '404' not in e], errs3[:3])
            pg3.close()
        check(vn + ': no script errors with a placed launch', not [e for e in errs2 if 'favicon' not in e], errs2[:3])
        check(vn + ': no script errors', not [e for e in errs if 'favicon' not in e], errs[:3])
        ctx.close()
finally:
    srv.terminate()
print(f'\n{ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
