import os, pathlib, re, socket, subprocess, sys, time, json, glob
from playwright.sync_api import sync_playwright
"""V3.9 (Ken, 27 Oct 2026; Claude D's approved proposal): the New launches directory. Run from the site folder.
 - research/new-launches/ lists exactly the projects Ken approved (data/research/sites.json "directory"), in that order: name, location, one
   "Explore project" link to the existing site (new tab), nothing else (no descriptions, addresses, chips); two columns, one on a phone.
 - opening a project is tracked as microsite_clicked (placement new-launches) and carries the referral parameters, never anything typed.
 - V3.9 navigation (Ken, 15:14): "New Launches" in the desktop header between Map and Calculators on every page (from 960px; on 900-959px it
   steps back to avoid crowding); a full "New launches" entry in the menu's Research column (desktop and phone), after Map, styled like the
   others; on the page, New Launches is current in the header and Research in the phone row; "All new launches" on the Research page; search finds it."""
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
    else: fail += 1; print('  FAIL', n, str(i)[:400])
S = json.load(open(SITE / 'data/research/sites.json'))
WANT = sorted([x for x in S['sites'] if x.get('status') == 'configured' and x.get('url')], key=lambda x: (x.get('directory') or 999, x['name']))
check('every project with a live site, in Ken\'s order: Thomson Reserve, Lucerne Grand, Hougang Central, One Chuan Grove', [x['id'] for x in WANT] == ['thomson-reserve', 'lucerne-grand', 'hougang-central', 'one-chuan-grove'], [x['id'] for x in WANT])
# static: every page's menu has the one New launches line under Research, and no new top-navigation item
pages = [f for f in glob.glob(str(SITE / '**/*.html'), recursive=True) if 'class="gw-mcols"' in open(f, encoding='utf8').read()]
def hdr(f):
    m = re.search(r'<nav class="gw-links"[^>]*>(.*?)</nav>', open(f, encoding='utf8').read(), re.S); return [re.sub('<[^>]+>', '', x) for x in re.findall(r'<a [^>]*>.*?</a>', m.group(1))] if m else None
bad = [f for f in pages if hdr(f) != ['Plan My Move', 'Research', 'Map', 'New Launches', 'Calculators']]
check(f'every page with the header ({len(pages)}): Plan My Move · Research · Map · New Launches · Calculators', not bad, bad[:3])
def col(f):
    m = re.search(r'<section class="gw-ms gw-ms-research">(.*?)</section>', open(f, encoding='utf8').read(), re.S); return re.findall(r'data-gw-nav-to="([^"]+)"><svg', m.group(1)) if m else None
bad = [f for f in pages if col(f) != ['research', 'map', 'new-launches', 'what-can-i-buy', 'directory', 'sample']]
check('every menu: New launches is a full entry in the Research column, after Map; no quiet line, no highlight', not bad and not any('Buying new?' in open(f, encoding='utf8').read() for f in pages), bad[:3])
try:
    with sync_playwright() as p:
        br = p.chromium.launch()
        # the header at each width: visible, in order and on one row from 960px; stepped back at 900-959px; none below 900px (compact header)
        for w, want in ((1440, True), (1280, True), (1024, True), (960, True), (930, False), (900, False), (820, None), (390, None)):
            c2 = br.new_context(viewport={'width': w, 'height': 900}, is_mobile=w < 900, has_touch=w < 900); p2 = c2.new_page(); p2.goto(B + '/'); p2.wait_for_load_state('domcontentloaded')
            r = p2.evaluate("()=>{const as=[...document.querySelectorAll('.gw-nav .gw-links a')].filter(a=>a.offsetParent);const inn=document.querySelector('.gw-nav .in');return {t:as.map(a=>a.textContent),rows:new Set(as.map(a=>Math.round(a.getBoundingClientRect().top))).size,over:inn.scrollWidth-inn.clientWidth,page:document.documentElement.scrollWidth-innerWidth}}")
            exp = ['Plan My Move', 'Research', 'Map', 'New Launches', 'Calculators'] if want else ['Plan My Move', 'Research', 'Map', 'Calculators'] if want is False else []
            check(f'{w}px: header links {" · ".join(exp) or "none (compact header)"}, one row, nothing overflowing', r['t'] == exp and r['rows'] <= 1 and r['over'] <= 0 and r['page'] <= 0, r); c2.close()
        for tag, vp, mob in (('desktop', {'width': 1440, 'height': 900}, False), ('phone', {'width': 390, 'height': 844}, True)):
            ctx = br.new_context(viewport=vp, is_mobile=mob, has_touch=mob); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, body=''))
            pg.route(re.compile(r'^https://(units\.thomsonreserve|lucernegrand|hougangcentral)\.kentanthepropertyguy\.com/'), lambda r: r.fulfill(status=200, content_type='text/html', body='<p>site</p>'))
            pg.goto(B + '/research/new-launches/'); pg.wait_for_load_state('domcontentloaded')
            check(f'{tag}: heading "New launches"', pg.inner_text('h1').strip() == 'New launches')
            rows = pg.evaluate("()=>[...document.querySelectorAll('.gw-nls a.gw-nl')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),href:a.getAttribute('href'),tgt:a.target,ms:a.dataset.kptMs,r:a.getBoundingClientRect().toJSON()}))")
            want = [f"{x['name']} {x['area']} · District {x['district']} Explore project" for x in WANT]
            check(f'{tag}: the four projects, in order, each with name, location and Explore project only', [r['t'] for r in rows] == want, [r['t'] for r in rows])
            check(f'{tag}: each opens its existing site in a new tab', [r['href'] for r in rows] == [x['url'] for x in WANT] and all(r['tgt'] == '_blank' for r in rows), [r['href'] for r in rows])
            main = pg.inner_text('main')
            check(f'{tag}: no descriptions, website addresses or status chips', not any(x['tagline'] in main for x in WANT) and 'kentanthepropertyguy.com' not in main and pg.locator('main .kpe-tag, main .gw-ctag, main em').count() == 0)
            cols = len(set(round(r['r']['x']) for r in rows))
            check(f'{tag}: {"two columns" if tag == "desktop" else "one column"}; no sideways scrolling', cols == (2 if tag == 'desktop' else 1) and pg.evaluate("document.documentElement.scrollWidth<=innerWidth"), cols)
            cur = pg.evaluate("()=>[...document.querySelectorAll('[aria-current=page]')].filter(a=>a.offsetParent).map(a=>a.textContent.trim())")
            check(f'{tag}: the current section shown is ' + ('New Launches (header)' if tag == 'desktop' else 'Research (phone row)'), cur == (['New Launches'] if tag == 'desktop' else ['Research']), cur)
            pg.click('.gw-menu summary'); pg.wait_for_selector('.gw-ms-research a[data-gw-nav-to="new-launches"]', state='visible')
            st = pg.evaluate("()=>{const a=document.querySelector('.gw-ms-research a[data-gw-nav-to=new-launches]'),m=document.querySelector('.gw-ms-research a[data-gw-nav-to=map]');const f=(e)=>{const c=getComputedStyle(e.querySelector('b'));return [c.fontSize,c.fontWeight,c.color,getComputedStyle(e).outlineStyle,getComputedStyle(e).backgroundColor]};return {nl:f(a),map:f(m),t:a.innerText.replace(/\\s+/g,' ').trim()}}")
            check(f'{tag}: the menu entry looks exactly like Map\'s (same type, colour, no outline or highlight) and reads "New launches"', st['nl'] == st['map'] and st['t'].startswith('New launches'), st)
            pg.click('.gw-menu summary')
            bg = pg.evaluate("()=>getComputedStyle(document.querySelector('.gw-nl')).backgroundColor")
            check(f'{tag}: white entries', bg == 'rgb(255, 255, 255)', bg)
            # opening a project: tracked, with the referral parameters, and nothing typed
            pg.evaluate("()=>{window.__ev=[];const t=KPT.track;KPT.track=function(n,o){window.__ev.push([n,o]);return t&&t.apply(this,arguments)}}")
            with ctx.expect_page() as np: pg.click('.gw-nl[data-kpt-ms="thomson-reserve"]')
            new = np.value; new.wait_for_load_state('domcontentloaded'); u = new.url; new.close()
            ev = pg.evaluate('window.__ev')
            check(f'{tag}: opening Thomson Reserve is tracked as microsite_clicked (placement new-launches) and names Groundwork as the referrer', ['microsite_clicked', {'project_id': 'thomson-reserve', 'destination_host': 'units.thomsonreserve.kentanthepropertyguy.com', 'placement': 'new-launches'}] in ev and 'utm_source=kpt' in u and 'kpt_from=new-launches' in u, [ev, u])
            pg.goto(B + '/research/'); pg.wait_for_selector('.gw-rown', state='visible')
            line = pg.inner_text('.gw-rown'); a = pg.locator('.gw-rown a.gw-rown-all')
            check(f'{tag}: the Research page\'s current-projects line ends with "All new launches ›", linking to the directory', line.strip().endswith('All new launches ›') and a.get_attribute('href') == 'new-launches/', line)
            with pg.expect_navigation(): a.click()
            check(f'{tag}: ... which opens it', pg.url.endswith('/research/new-launches/'), pg.url)
            hits = pg.evaluate("()=>GWN.matchTools('new launches',5).map(e=>e.href)")
            check(f'{tag}: search "new launches" finds the directory', 'research/new-launches/' in hits, hits)
            check(f'{tag}: no script errors', not errs, errs)
            ctx.close()
        br.close()
finally:
    srv.terminate()
print(f'new-launches-render: {ok} passed, {fail} failed'); sys.exit(1 if fail else 0)
