# python3 tools/what-can-i-buy/tests/results-layout-render.py
# Results layout (Ken, 28 Oct 2026): Budget Search results as a comparison table on a desktop and compact expandable cards on a phone.
# Presentation only: the same search, items, counts and prices. Checked here, at 1440, 1280, 1024, 390 and 360 px:
#   width used (no horizontal scroll), a plain header (no breakdown counts), N = confirmed matches, the not-confirmed group collapsed with a neutral size heading,
#   sorting reorders and never changes the set (lowest price first by default), every Research / Map link resolves (none where there is no page),
#   New launch: the check date once per group and no URA price; Either: separate groups; North Gaia listed as an EC; names written properly;
#   tenure shown as recorded (Freehold / N-year lease from YYYY / N-year leasehold; no TOP or age); chips wrap whole on a phone;
#   an opened card adds only what the row does not already say; saved search, Back / Forward and Edit search.
# The listings file is served with its dates moved relative to now, so the suite never depends on the day it runs.
import datetime as dt, json, os, pathlib, re, socket, subprocess, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[3]
INV = json.load(open(ROOT / 'data/projects/inventory.json'))
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(ROOT / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
BASE = f'http://127.0.0.1:{P}'
passed = failed = 0
def t(name, fn):
    global passed, failed
    try: fn(); passed += 1; print('  ok   ' + name)
    except Exception as e: failed += 1; print('  FAIL ' + name + '\n       ' + str(e).split('\n')[0][:400])
def ok(c, m='assertion failed'):
    if not c: raise AssertionError(m)
def inv_body():
    at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=12)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    d = json.loads(json.dumps(INV)); d['checkedAt'] = at
    for p in d['projects']: p['checkedAt'] = at
    return json.dumps(d)
BODY = inv_body()
def ctx_page(br, w):
    kw = dict(viewport={'width': w, 'height': 900}) if w > 600 else dict(viewport={'width': w, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'/data/projects/inventory\.json'), lambda r: r.fulfill(status=200, content_type='application/json', body=BODY))
    return ctx, pg, errs
def search(pg, budget, sale='either', beds=None, typ=None):
    pg.goto(BASE + '/tools/what-can-i-buy/'); pg.wait_for_selector('#kdBudget'); pg.wait_for_function("!/loading/.test((document.querySelector('[data-bedsblk]') || {}).textContent || '')", timeout=20000)
    pg.fill('#kdBudget', budget); pg.click(f'[data-k=sale] [data-v={sale}]')
    if typ: pg.click(f'[data-k=type] [data-v={typ}]')
    if beds:
        if not pg.evaluate("document.querySelector('[data-more]').open"): pg.click('[data-more] > summary')
        pg.click(f'[data-k=beds] [data-v="{beds}"]'); pg.wait_for_function("window.__kd && __kd.beds() !== 'loading'", timeout=15000)
    pg.click('[data-f=show]'); pg.wait_for_selector('#kdH', timeout=25000); pg.wait_for_timeout(300)
def H(pg): return pg.inner_text('#kdH')
def no_hscroll(pg): return not pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
def num(s):
    m = re.search(r'\$([\d.]+)M', s); return float(m.group(1)) if m else None
def show_all(pg, scope):
    for _ in range(12):
        b = pg.query_selector(scope + ' .kd-more-b')
        if not b: return
        b.click(); pg.wait_for_timeout(150)
MATCH = r'^(\d+) developments? match(es)? your search$'
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    print('Widths and header')
    def widths():
        out = {}
        for w in (1440, 1280, 1024, 390):
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', beds=3)
            mw = pg.evaluate("document.querySelector('.kd-main').getBoundingClientRect().width"); lw = pg.evaluate("document.querySelector('.kd-lead').getBoundingClientRect().width")
            th = pg.evaluate("getComputedStyle(document.querySelector('.kd-th')).display"); out[w] = (round(mw), round(lw), th)
            ok(no_hscroll(pg), f'{w}: no horizontal scroll')
            if w > 900: ok(mw >= min(1360, w - 2 * min(40, max(16, 0.028 * w))) - 2 and   # Design Standard R1: the shared shell (1,360 content, gutter clamp(16px, 2.8vw, 40px))
                   abs(lw - mw) < 2 and th == 'table-header-group', f'{w}: header and results use the width, as a table: {out[w]}')
            else: ok(mw >= w - 32 - 2 and th == 'none', f'{w}: full-width cards: {out[w]}')
            ok(not errs, str(errs)); ctx.close()
        print('       widths', out)
    t('container: the shared 1,360 px shell at 1440, the full width at 1280 and 1024 (header and results alike), a table on a desktop and cards at 390; no horizontal scroll', widths)
    for w in (1440, 390):
        vn = 'desktop' if w > 600 else 'phone'
        print(f'Results, {vn}')
        def header_counts():
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', beds=3)
            h = H(pg); m = re.match(MATCH, h); ok(m, h); lead = pg.inner_text('.kd-lead')
            ok(lead.strip() == h and not re.search(r'typical prices|only some|not confirmed|with recent', lead), 'no breakdown in the header: ' + lead)
            ch = pg.inner_text('.kd-chips'); ok(all(x in ch for x in ('3 bedrooms', 'Up to $2M', 'All property types', 'New launch and resale')), ch)
            c = pg.evaluate("__kd.res().counts"); items = pg.evaluate("__kd.res().items.map(i => i.id + '|' + i.sale)")
            ok(int(m.group(1)) == c['projects'] == len(set(x.split('|')[0] for x in items)), f"N {m.group(1)} = confirmed developments {c['projects']}")
            gs = pg.eval_on_selector_all('.kd-sec[data-cls] .kd-g', "e => e.map(g => +g.querySelector('.kd-cnt').textContent)"); ok(sum(gs) == len(items) == c['items'], f'group counts {gs} add up to the {len(items)} listings')
            ok(not any(x for x in pg.evaluate("__kd.res().items.map(i => i.beds && i.beds.state === 'insufficient')")), 'no unconfirmed item among the matches')
            un = pg.query_selector('.kd-unconf'); ok(un and not un.evaluate('e => e.open'), 'not-confirmed group collapsed')
            ok(str(c['insufficient']) in un.query_selector('summary').inner_text(), 'its own count')
            un.query_selector('summary').click(); pg.wait_for_timeout(200)
            ok('Bedroom type not confirmed' in un.inner_text() and 'Not counted' in un.inner_text(), 'one line says the type is unconfirmed and not counted')
            if w > 600: hs = un.eval_on_selector_all('.kd-th th', 'e => e.map(x => x.textContent.replace(/[▲▼]/g, "").trim())'); ok(hs[3] == 'Size', 'neutral size heading: ' + str(hs))
            ok('3BR' not in un.inner_text(), 'no “3BR” label on unconfirmed sizes')
            show_all(pg, '.kd-sec[data-cls]'); tiers = dict(pg.evaluate("__kd.res().items.map(i => [i.id + '|' + i.sale, i.tier])")); marked = dict(pg.eval_on_selector_all('.kd-sec[data-cls] .kd-row', "e => e.map(r => [r.dataset.pid + '|' + r.dataset.sale, (r.querySelector('.kd-rp small') || {}).textContent || ''])"))
            ok(all((tiers[k] == 'some') == ('Some sales within your max' in v) for k, v in marked.items()), 'every row whose typical price is above the maximum says so, and no other: ' + str([k for k, v in marked.items() if (tiers[k] == 'some') != ('Some sales within your max' in v)][:5]))
            ok(any(tiers[k] == 'some' for k in marked), 'the search has such rows to check')
            meth = pg.evaluate("(() => { const d = document.querySelector('.kd-meth'); d.open = true; return d.innerText; })()")
            ok('This search:' in meth and 'typical (median)' in meth and 'middle half' in meth, 'the breakdown and the price method are in “How these are matched”')
            ok(not errs, str(errs)); ctx.close()
        t(vn + ': “N developments match your search”, chips, no breakdown; N = confirmed developments; the group counts add up; not-confirmed collapsed, neutral “Size”, not counted', header_counts)
        def sorting():
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', sale='resale', beds=3, typ='ec')
            g = '.kd-g[data-sale=resale]'; show_all(pg, g)
            base = pg.eval_on_selector_all(g + ' .kd-row', "e => e.map(r => r.dataset.pid)"); prices = [num(x) for x in pg.eval_on_selector_all(g + ' .kd-rp b', 'e => e.map(x => x.textContent)')]
            ok(pg.input_value(g + ' [data-f=sort]') == 'price:asc' and prices == sorted(prices), 'lowest price first by default: ' + str(prices[:8]))
            for k in ('district', 'name', 'match', 'price'):
                pg.select_option(g + ' [data-f=sort]', k + ':asc'); pg.wait_for_timeout(250); show_all(pg, g)
                got = pg.eval_on_selector_all(g + ' .kd-row', "e => e.map(r => r.dataset.pid)"); ok(sorted(got) == sorted(base) and len(got) == len(base), k + ': same developments, reordered')
                if k == 'name': names = pg.eval_on_selector_all(g + ' .kd-rt', 'e => e.map(x => x.textContent.toLowerCase())'); ok(names == sorted(names), 'A to Z')
                if k == 'district': ds = [int(x[1:]) for x in pg.eval_on_selector_all(g + ' .kd-rdi', 'e => e.map(x => x.textContent)')]; ok(ds == sorted(ds), 'by district')
            ok(pg.evaluate("__kd.res().counts.projects") == len(base), 'the search itself is unchanged'); ok(not errs, str(errs)); ctx.close()
        t(vn + ': sorting (price, district, name, best match) reorders the rows and never changes the set; lowest price first by default', sorting)
        def new_launch():
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', sale='new', beds=3)
            gs = pg.query_selector_all('.kd-g[data-sale=new]'); ok(gs, 'new-launch groups')
            for g in gs:
                ok(g.inner_text().count('Developer listings · Checked') == 1, 'the check date once per group')
                for r in g.query_selector_all('.kd-row'): ok(re.search(r'from \$[\d.]+M', r.query_selector('.kd-rp').inner_text()), 'an asking price per row')
            ok(pg.evaluate("__kd.res().items.every(i => i.sale === 'new' && i.ura === null && i.inv && i.inv.state === 'match')"), 'no URA price behind any new launch')
            ok(pg.query_selector('.kd-g[data-sale=resale]') is None and '(URA)' not in pg.inner_text('#kdRes'), 'no resale group, no URA figure')
            ec = pg.query_selector('.kd-sec[data-cls=ec] .kd-row[data-pid=north-gaia]'); ok(ec is not None and pg.query_selector('.kd-sec[data-cls=condo] .kd-row[data-pid=north-gaia]') is None, 'North Gaia is under Executive Condominiums, not condos')
            ok('99-year lease from 2021' in ec.inner_text(), 'with its URA lease start: ' + ec.inner_text().replace('\n', ' | '))
            n = int(re.match(MATCH, H(pg)).group(1)); secs = pg.eval_on_selector_all('.kd-sec[data-cls] .kd-g', "e => e.map(g => +g.querySelector('.kd-cnt').textContent)"); ok(sum(secs) == n, f'condo + EC = {n}: {secs}')
            ok(not errs, str(errs)); ctx.close()
        t(vn + ': New launch: the check date once per group, asking prices only (no URA), North Gaia under ECs, the sections add up to N', new_launch)
        def either():
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', beds=3)
            for s in pg.query_selector_all('.kd-sec[data-cls]'):
                sales = s.eval_on_selector_all('.kd-g', 'e => e.map(g => g.dataset.sale)'); ok(len(sales) == len(set(sales)), 'one group per source in each class: ' + str(sales))
            rg = pg.query_selector('.kd-g[data-sale=resale]'); ng = pg.query_selector('.kd-g[data-sale=new]')
            ok(rg.query_selector('.kd-gn').inner_text() == 'Estimates from past URA transactions, not current listings.', 'resale note, exactly: ' + rg.query_selector('.kd-gn').inner_text())
            ok('Developer listings · Checked' in ng.query_selector('.kd-gn').inner_text() and 'URA' not in ng.query_selector('.kd-gn').inner_text(), 'new launches from listings')
            ok(pg.inner_text('#kdRes').count('Estimates from past URA transactions') == len(pg.query_selector_all('.kd-g[data-sale=resale]')), 'said once per resale group, not per row')
            ok(not errs, str(errs)); ctx.close()
        t(vn + ': Either keeps resale and new launches in separate groups, each explained once', either)
        def links():
            ctx, pg, errs = ctx_page(br, w); search(pg, '20,000,000', sale='new')
            show_all(pg, '#kdRes'); rows = pg.eval_on_selector_all('.kd-sec[data-cls] .kd-row', "e => e.map(r => ({ id: r.dataset.pid, name: r.querySelector('.kd-rt').textContent, links: [...r.querySelectorAll('a')].map(a => a.getAttribute('href')) }))")
            idx = json.load(open(ROOT / 'data/projects/index.json')); ids = {r[0] for r in idx['rows']}; up = {x['id'] for x in json.load(open(ROOT / 'data/map/upcoming.json'))['items']}
            dead = [r for r in rows if r['links'] and r['id'] not in ids and r['id'] not in up]; ok(not dead, 'a link with no page behind it: ' + str(dead[:3]))
            bare = [r['id'] for r in rows if not r['links']]; ok(all(i not in ids and i not in up for i in bare), 'a page exists but no link: ' + str(bare))
            ok(all(len(r['links']) == 2 and r['links'][0].startswith('../../research/#/p/' + r['id']) and r['links'][1] == '../../research/map/#p=' + r['id'] for r in rows if r['links']), 'each linked row: Research, then Map')
            print('       new launches at $20m:', len(rows), 'rows;', len(bare), 'with no page and so no link:', bare)
            sample = [r for r in rows if r['id'] in ('north-gaia', 'lucerne-grand')] + [r for r in rows if r['links'] and r['links'][0].endswith('/new')][:2] + [r for r in rows if r['links'] and not r['links'][0].endswith('/new') and r['id'] in ids][:1]
            for r in sample:
                pg.goto(BASE + '/research/' + r['links'][0].split('research/')[1]); pg.wait_for_function('n => document.body.innerText.toLowerCase().includes(n.toLowerCase())', arg=r['name'].split(' ')[0], timeout=30000)
                ok('couldn’t find' not in pg.inner_text('body').lower() and 'not found' not in pg.inner_text('body').lower(), 'Research opens ' + r['id'])
                pg.goto(BASE + '/research/map/' + r['links'][1].split('research/map/')[1]); pg.wait_for_selector('.leaflet-container', timeout=30000); pg.wait_for_function("document.querySelectorAll('.selchip').length === 1", timeout=20000)
            print('       opened on Research and the Map:', [r['id'] for r in sample]); ok(not errs, str(errs)); ctx.close()
        if w > 600: t(vn + ': every Research / Map link has a page behind it (listing-only developments without one get none); a sample opens on both', links)
        def names_tenure():
            ctx, pg, errs = ctx_page(br, w); search(pg, '20,000,000', sale='resale')
            for k in ('resale',):
                show_all(pg, '#kdRes')
            names = pg.eval_on_selector_all('.kd-row .kd-rt', 'e => e.map(x => x.textContent)')
            bad = [n for n in names if re.search(r"[a-z]'S\b|@[a-z]|\b(ST|LA|LE|DE|MI|MY|FE|NO)\b|\s(Of|At)\s", n)]; ok(not bad, 'names written properly: ' + str(bad[:6]))
            ok("People's Park Complex" in names, 'People’s Park Complex, not People’S')
            ten = pg.eval_on_selector_all('.kd-row .kd-rten', 'e => e.map(x => x.textContent)')
            ok(all(re.match(r"^(Freehold|\d+-year lease from \d{4}|\d+-year leasehold)$", x) for x in ten), 'tenure as recorded: ' + str([x for x in ten if not re.match(r"^(Freehold|\d+-year lease from \d{4}|\d+-year leasehold)$", x)][:4]))
            kinds = {('Freehold' if x == 'Freehold' else '999' if x.startswith('999-year lease from') else 'from' if 'lease from' in x else 'hold') for x in ten}
            ok({'Freehold', '999', 'from'} <= kinds, 'Freehold, 999-year and 99-year with a year all shown: ' + str(kinds))
            ok(not re.search(r'\bTOP\b|years old|\bage\b|completed in', pg.inner_text('#kdRes'), re.I), 'no TOP or age from the lease year')
            ok(not errs, str(errs)); ctx.close()
        t(vn + ': names written properly (People’s, St, @Name, “at”); tenure as recorded, with no TOP or age', names_tenure)
        def unknown_year():
            ctx, pg, errs = ctx_page(br, w); search(pg, '20,000,000', sale='new'); show_all(pg, '#kdRes')
            ten = dict(pg.eval_on_selector_all('.kd-row', "e => e.map(r => [r.dataset.pid, r.querySelector('.kd-rten').textContent])"))
            ok(ten.get('eden-residences-at-capitol') == '99-year leasehold' or 'eden-residences-at-capitol' not in ten, 'no year on record: “99-year leasehold”: ' + str(ten.get('eden-residences-at-capitol')))
            ok(any(v == '99-year leasehold' for v in ten.values()), 'an unknown lease year is shown without a date')
            ok(not errs, str(errs)); ctx.close()
        t(vn + ': a listing with no lease year on record says “99-year leasehold”, never a guessed year', unknown_year)
    for w in (390, 360):
        def chips_wrap():
            ctx, pg, errs = ctx_page(br, w); search(pg, '2,000,000', beds=3)
            r = pg.evaluate("[...document.querySelectorAll('.kd-chip, .kd-editb')].map(e => { const b = e.getBoundingClientRect(); return [e.textContent.trim(), Math.round(b.left), Math.round(b.right), e.scrollWidth <= e.clientWidth + 1]; })")
            ok(all(x[1] >= 0 and x[2] <= w and x[3] for x in r), 'every chip and Edit search whole and on screen: ' + str(r))
            ok(pg.evaluate("document.querySelector('.kd-chips').scrollWidth <= document.querySelector('.kd-chips').clientWidth + 1"), 'the chip row is not cut off'); ok(no_hscroll(pg), 'no sideways scroll')
            ok('Include developments up to 5% over budget' in pg.inner_text('.kd-quick2') and 'Listed separately' not in pg.inner_text('.kd-quick2'), 'the 5% control is one line')
            ok(not errs, str(errs)); ctx.close()
        t(f'{w} px: the chips wrap, every label whole; the 5% control is one line', chips_wrap)
    # ---- sorting by the column headings (Ken, 28 Oct 2026) ----
    def row_vals(pg, tbl):
        return pg.eval_on_selector_all(tbl + ' .kd-row', """e => e.map(r => ({ id: r.dataset.pid, sale: r.dataset.sale, unc: r.classList.contains('kd-unc'), name: r.querySelector('.kd-rt').textContent.toLowerCase(),
          d: +r.querySelector('.kd-rdi').textContent.slice(1), ten: r.querySelector('.kd-rten').textContent, size: (r.querySelector('.kd-rs').textContent.match(/(\\d[\\d,]*)–/) || [])[1], price: (r.querySelector('.kd-rp b').textContent.match(/\\$([\\d.]+)/) || [])[1] }))""")
    def tkey(t):
        if t == 'Freehold': return (0, 0)
        m = re.match(r'^(\d+)-year lease(?: from (\d{4})|hold)$', t)
        if not m: return None
        y = int(m.group(1)); return ((1 if y == 999 else 2 if y == 99 else 3), (-int(m.group(2)) if m.group(2) else None))
    def keyed(r, k):
        if k == 'name': return [r['name']]
        if k == 'district': return [r['d']]
        if k == 'size': return [int(r['size'].replace(',', ''))] if r['size'] else None
        if k == 'price': return [float(r['price'])] if r['price'] else None
        if k == 'tenure': t = tkey(r['ten']); return list(t) if t else None
    def in_order(rows, k, d):
        """each neighbour pair in order; anything missing (a whole value, or a part such as the lease year) last, whichever way"""
        for a, b in zip(rows, rows[1:]):
            va, vb = keyed(a, k), keyed(b, k)
            if va is None: return vb is None or (False, a, b)
            if vb is None: continue
            for x, y in zip(va, vb):
                if x is None and y is None: continue
                if x is None: return (False, a, b)
                if y is None: break
                if x != y:
                    if (x < y) != (d == 'asc'): return (False, a, b)
                    break
        return True
    def header_sort():
        ctx, pg, errs = ctx_page(br, 1440); search(pg, '2,000,000', beds=3)
        G = '.kd-sec[data-cls=condo] .kd-g[data-sale=resale]'; T = G + ' .kd-tbl'
        price_th = pg.query_selector(T + ' th:nth-child(5)'); ok(price_th.get_attribute('aria-sort') == 'ascending' and '▲' in price_th.inner_text(), 'default: price, lowest first, marked on its heading')
        ok(pg.eval_on_selector_all(T + ' th[aria-sort]', 'e => e.length') == 1 and pg.eval_on_selector_all(T + ' .kd-arr', 'e => e.length') == 1, 'only the active heading is marked')
        base = sorted(x['id'] for x in row_vals(pg, T)); show_all(pg, G); full0 = sorted(x['id'] for x in row_vals(pg, T))
        for k, col in (('name', 1), ('district', 2), ('tenure', 3), ('size', 4), ('price', 5)):
            for d in ('asc', 'desc'):
                for _ in range(3):
                    if pg.get_attribute(f'{T} th:nth-child({col})', 'aria-sort') == ('ascending' if d == 'asc' else 'descending'): break
                    btn = f'{T} th:nth-child({col}) .kd-sh'; lab = pg.get_attribute(btn, 'aria-label'); pg.click(btn); pg.wait_for_timeout(150)
                    ok(pg.evaluate("document.activeElement && document.activeElement.matches('[data-f=hsort]') && document.activeElement.dataset.k") == k, 'focus stays on the heading')
                    ok(re.match(r'^Sort by .+, (ascending|descending)$', lab), 'labelled: ' + lab)
                ok(pg.get_attribute(f'{T} th:nth-child({col})', 'aria-sort') == ('ascending' if d == 'asc' else 'descending'), f'{k} {d}: aria-sort')
                ok(pg.input_value(G + ' [data-f=sort]') == f'{k}:{d}', f'{k} {d}: the Sorted by control follows: ' + pg.input_value(G + ' [data-f=sort]'))
                page = row_vals(pg, T); ok(len(page) == 20, 'one page of 20 shown')
                show_all(pg, G); full = row_vals(pg, T)
                ok([x['id'] for x in page] == [x['id'] for x in full[:20]], f'{k} {d}: the first page is the first 20 of the whole section, sorted')
                r = in_order(full, k, d); ok(r is True, f'{k} {d}: in order, missing last: ' + str(r)[:300])
                ok(sorted(x['id'] for x in full) == full0, f'{k} {d}: the same developments'); ok(all(x['sale'] == 'resale' and not x['unc'] for x in full), 'resale rows only, confirmed only')
        ok(not errs, str(errs)); ctx.close()
    t('desktop headings: Development, District, Tenure, size and price each sort both ways over the whole section before paging, missing values last; aria-sort, label, focus and the Sorted by control follow', header_sort)
    def sections_kept():
        ctx, pg, errs = ctx_page(br, 1440); search(pg, '2,000,000', beds=3, sale='either')
        pg.click('.kd-sec[data-cls=condo] .kd-g[data-sale=resale] .kd-tbl th:nth-child(5) .kd-sh'); pg.wait_for_timeout(200)   # price, highest first: in every section, each on its own
        pg.check('.kd-quick2 [data-f=over]'); pg.wait_for_timeout(300); pg.click('.kd-unconf > summary'); pg.wait_for_timeout(200)
        cls = dict(pg.evaluate("__kd.res().items.concat(__kd.res().over).concat(__kd.res().beds ? __kd.res().beds.insufficient : []).map(i => [i.id + '|' + i.sale, i.cls])"))
        tables = pg.eval_on_selector_all('.kd-tbl', """e => e.map(t => ({ grp: t.dataset.grp, sale: t.dataset.sale, sort: (t.querySelector('th[aria-sort]') || {}).textContent || '', rows: [...t.querySelectorAll('.kd-row')].map(r => [r.dataset.pid + '|' + r.dataset.sale, r.classList.contains('kd-unc'), (r.querySelector('.kd-rp b').textContent.match(/\\$([\\d.]+)/) || [])[1]]) }))""")
        ok(len(tables) >= 4, 'condo and EC tables, the 5% list and the unconfirmed group: ' + str([x['grp'] for x in tables]))
        for tb in tables:
            g = tb['grp']; kinds = {cls.get(r[0]) for r in tb['rows']}; sales = {r[0].split('|')[1] for r in tb['rows']}
            ok('▼' in tb['sort'], g + ': sorted highest first too')
            if not g.startswith('over') and not g.startswith('unconf'): ok(len(kinds) == 1 and g.split('|')[0] in kinds and sales == {g.split('|')[1]}, g + ': one class and one source only: ' + str(kinds) + str(sales))
            if g.startswith('unconf'): ok(all(r[1] for r in tb['rows']), 'the unconfirmed group holds only unconfirmed rows')
            else: ok(not any(r[1] for r in tb['rows']), g + ': no unconfirmed row')
            ps = [float(r[2]) for r in tb['rows'] if r[2]]; ok(ps == sorted(ps, reverse=True), g + ': highest price first within its own table')
        ok(not errs, str(errs)); ctx.close()
    t('sorting stays inside each section: condos and ECs, resale and new launches, the 5% list and the unconfirmed group are each ordered on their own and never mixed', sections_kept)
    def keyboard():
        ctx, pg, errs = ctx_page(br, 1440); search(pg, '2,000,000', beds=3, sale='resale')
        T = '.kd-sec[data-cls=condo] .kd-tbl'; pg.focus(T + ' th:nth-child(2) .kd-sh'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        ok(pg.get_attribute(T + ' th:nth-child(2)', 'aria-sort') == 'ascending', 'Enter sorts by district'); pg.keyboard.press(' '); pg.wait_for_timeout(200)
        ok(pg.get_attribute(T + ' th:nth-child(2)', 'aria-sort') == 'descending' and pg.evaluate("document.activeElement.dataset.k") == 'district', 'Space reverses it, focus kept')
        ds = [x['d'] for x in row_vals(pg, T)]; ok(ds == sorted(ds, reverse=True), 'D28 … D1: ' + str(ds[:8])); ok(not errs, str(errs)); ctx.close()
    t('keyboard: Enter and Space on a heading sort and reverse it, focus kept; districts numerically (D1 < D9 < D10)', keyboard)
    def phone_menu():
        ctx, pg, errs = ctx_page(br, 390); search(pg, '2,000,000', beds=3, sale='resale')
        G = '.kd-sec[data-cls=condo] .kd-g[data-sale=resale]'; sel = G + ' [data-f=sort]'
        ok(pg.evaluate("getComputedStyle(document.querySelector('.kd-th')).display") == 'none' and pg.is_visible(sel) and 'Sort by' in pg.inner_text(G + ' .kd-sort'), 'phone: a compact Sort by menu, no headings')
        opts = pg.eval_on_selector_all(sel + ' option', 'e => e.map(o => o.value)')
        ok(all(x in opts for x in ('price:asc', 'price:desc', 'name:asc', 'name:desc', 'district:asc', 'size:asc', 'size:desc', 'tenure:asc', 'match:asc')) and 'near:asc' not in opts, 'every order, both ways where it matters; no distance without a place: ' + str(opts))
        pg.select_option(sel, 'price:desc'); pg.wait_for_timeout(200); show_all(pg, G); ps = [float(x['price']) for x in row_vals(pg, G)]; ok(ps == sorted(ps, reverse=True), 'price, high to low')
        pg.select_option(sel, 'size:asc'); pg.wait_for_timeout(200); show_all(pg, G); r = in_order(row_vals(pg, G), 'size', 'asc'); ok(r is True, 'size, small to large: ' + str(r)[:200])
        pg.select_option(sel, 'name:desc'); pg.wait_for_timeout(200); show_all(pg, G); ns = [x['name'] for x in row_vals(pg, G)]; ok(ns == sorted(ns, reverse=True), 'name, Z to A')
        ok(no_hscroll(pg), 'no sideways scroll'); ok(not errs, str(errs)); ctx.close()
    t('390 px: the Sort by menu offers price, name and size both ways, district, tenure and best match (and distance with a place)', phone_menu)
    def expanded():
        ctx, pg, errs = ctx_page(br, 390); search(pg, '2,000,000', beds=3)
        for sel in ('.kd-g[data-sale=resale] .kd-row', '.kd-g[data-sale=new] .kd-row'):
            row = pg.query_selector(sel); pid = row.get_attribute('data-pid'); sale = row.get_attribute('data-sale')
            name = row.query_selector('.kd-rt').inner_text(); rest = [row.query_selector(x).inner_text().strip() for x in ('.kd-rdi', '.kd-rten', '.kd-rp b')] + [row.query_selector('.kd-rs').inner_text().split('· ')[-1]]
            ok(not row.query_selector('.kd-acts').is_visible(), 'links tucked away until opened')
            row.query_selector('.kd-rt').click(); pg.wait_for_timeout(200); row = pg.query_selector(f'.kd-row[data-pid="{pid}"][data-sale="{sale}"]')
            ok(row.query_selector('.kd-acts').is_visible(), 'opened: Research and Map')
            rx = pg.query_selector(f'.kd-rxr[data-for="{pid}|{sale}"] .kd-rx'); d = rx.inner_text() if rx else ''   # the details are the next table row
            ok(not any(x and x in d for x in [name] + rest), 'the opened card repeats nothing from the row: ' + d + ' | ' + str(rest))
            ok(not re.search(r'URA rental records|floor plans|\(URA\)', d), 'no methodology in the panel: ' + d)
        ok(not errs, str(errs)); ctx.close()
    t('390 px: an opened card adds only what the row does not say (and shows its links); no methodology', expanded)
    def history():
        ctx, pg, errs = ctx_page(br, 1440); search(pg, '2,000,000', beds=3); h0, c0 = H(pg), pg.inner_text('.kd-chips')
        pg.select_option('.kd-g[data-sale=resale] [data-f=sort] >> nth=0', 'name:asc'); pg.wait_for_timeout(200)
        pg.reload(); pg.wait_for_selector('#kdH', timeout=25000); ok(H(pg) == h0 and pg.inner_text('.kd-chips') == c0, 'saved search: a reload opens the same results')
        pg.click('.kd-editb'); pg.wait_for_selector('#kdEdit.open'); pg.fill('#kdEdit #kdBudget', '1,800,000'); pg.keyboard.press('Tab'); pg.wait_for_function("document.querySelector('.kd-chips').innerText.includes('Up to $1.8M')", timeout=15000)
        ok(pg.query_selector('.kd-entry') is None, 'Edit search updates the results in place')
        pg.go_back(); pg.wait_for_selector('.kd-entry #kdBudget', timeout=15000); ok(pg.input_value('#kdBudget') == '1,800,000' and pg.query_selector('[data-k=beds] [data-v="3"][aria-checked=true]') is not None, 'Back: the form, with every requirement')
        pg.go_forward(); pg.wait_for_selector('#kdH', timeout=15000); ok('Up to $1.8M' in pg.inner_text('.kd-chips') and re.match(MATCH, H(pg)), 'Forward: the results again')
        ok(not errs, str(errs)); ctx.close()
    t('saved search, Edit search in place, Back to the form and Forward to the results', history)
    br.close()
finally:
    srv.terminate()
print(f'\nresults-layout-render: {passed} passed, {failed} failed')
raise SystemExit(1 if failed else 0)
