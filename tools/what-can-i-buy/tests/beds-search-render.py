# python3 tools/what-can-i-buy/tests/beds-search-render.py   Budget Search with a bedroom count, in a real browser (desktop and a 390px phone):
# budget + 2 / 3 bedrooms, place + bedrooms, property types, bedrooms not confirmed, no results, editing, Back/Forward, the Research form, and the
# fallback when find-beds.json is missing. Screenshots go to $GW_SHOTS when it is set.
import json, os, pathlib, re, socket, subprocess, sys, time
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[3]
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082')
SHOTS = os.environ.get('GW_SHOTS')
def port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p
P = port(); srv = subprocess.Popen(['node', str(ROOT / 'tools/serve-local.js')], env={**os.environ, 'PORT': str(P)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(100):
    try: socket.create_connection(('127.0.0.1', P), 0.2).close(); break
    except OSError: time.sleep(0.05)
ANS = json.load(open(ROOT / 'research/tests/fixtures/onemap-postal.json'))['answers']
def _search(r):
    m = re.search(r'searchVal=(\d+)', r.request.url); body = ANS.get(m.group(1), {'found': 0, 'results': []}) if m else {'found': 0, 'results': []}
    r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
# V3.10: the page's clock is set from the live inventory file's own date (12 hours after the check), so a data refresh needs no test edit
import datetime as _dt
_INV_AT = _dt.datetime.fromisoformat(json.load(open(ROOT / 'data/projects/inventory.json'))['checkedAt'].replace('Z', '+00:00'))
_at = lambda hours: '?now=' + (_INV_AT + _dt.timedelta(hours=hours)).strftime('%Y-%m-%dT%H:%M:%SZ')
BASE = f'http://127.0.0.1:{P}'; NOW = _at(12)
passed = failed = 0
def t(name, fn):
    global passed, failed
    try: fn(); passed += 1; print('  ok   ' + name)
    except Exception as e: failed += 1; print('  FAIL ' + name + '\n       ' + str(e).split('\n')[0][:300])
def ok(c, m='assertion failed'):
    if not c: raise AssertionError(m)
def open_page(br, kw, path='tools/what-can-i-buy/', q=NOW, no_beds=False):
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    pg.route(re.compile(r'googletagmanager|facebook\.net'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    pg.route(re.compile(r'onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='image/png', body=PNG)); pg.route(re.compile(r'onemap\.gov\.sg/api/common/elastic/search'), _search)
    if no_beds: pg.route(re.compile(r'find-beds\.json'), lambda r: r.fulfill(status=404, body='not found'))
    pg.goto(f'{BASE}/{path}{q}'); return ctx, pg, errs
def form(pg, budget, sale=None, beds=None, typ=None, place=None):
    pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', budget)
    if place:
        pg.type('#kdPlace', place, delay=5); pg.wait_for_selector('.kd-sg', timeout=20000); pg.click('.kd-sg >> nth=0'); pg.wait_for_timeout(300)
    if typ: pg.click(f'[data-f=seg][data-k=type][data-v={typ}]')
    if sale: pg.click(f'[data-f=seg][data-k=sale][data-v={sale}]')
    if beds:
        if not pg.evaluate("document.querySelector('[data-more]').open"): pg.click('[data-f=moresum]')
        pg.click(f'[data-f=seg][data-k=beds][data-v="{beds}"]'); pg.wait_for_function("window.__kd && __kd.beds() !== 'loading'", timeout=15000)
def show(pg):
    pg.click('[data-f=show]'); pg.wait_for_selector('#kdH', timeout=25000); pg.wait_for_timeout(200)
H = lambda pg: pg.inner_text('#kdH').replace('‑', '-')
CH = lambda pg: pg.inner_text('.kd-chips')   # Results layout (Ken, 28 Oct 2026): bedrooms and budget are chips under "N developments match your search"
MATCH = r'^\d+ developments? match(es)? your search$'
no_overflow = lambda pg: not pg.evaluate('document.documentElement.scrollWidth>innerWidth+1')
def shot(pg, name):
    if SHOTS: pathlib.Path(SHOTS).mkdir(parents=True, exist_ok=True); pg.screenshot(path=os.path.join(SHOTS, name + '.png'))
VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        print(f'Bedroom Search, {vn}')
        def two_bed():
            ctx, pg, errs = open_page(br, kw); form(pg, '1,500,000', sale='resale', beds=2)
            note = pg.inner_text('.kd-more'); ok('URA rental records or floor plans' in note and 'listed separately' in note, note)
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="2"][disabled]') is None, 'bedrooms are on for resale')
            show(pg); h = H(pg); ok(re.match(MATCH, h) and '2 bedrooms' in CH(pg) and 'Up to $1.5M' in CH(pg), h + ' | ' + CH(pg))
            it = pg.evaluate("(() => { const r = __kd.res(); return r.items.filter(i => i.sale === 'resale').map(i => ({ id: i.id, med: i.ura.med, st: i.beds.state, sized: i.beds.sized })); })()")
            first = pg.locator('.kd-sec[data-cls] .kd-row').first; fid = first.get_attribute('data-pid'); fi = [x for x in it if x['id'] == fid][0]
            ok(fi['st'] == 'reliable' and ('$%.2fM' % (round(fi['med'] / 10000) / 100)) in first.inner_text(), 'the row shows the typical (median) 2-bedroom resale price: ' + first.inner_text()[:160])
            first.locator('.kd-rt').click(); pg.wait_for_timeout(300); d = pg.locator(f'.kd-rxr[data-for="{fid}|resale"] .kd-rx').inner_text()   # the details are the next table row
            ok('Middle half' in d and 'based on' in d and 'URA rental records' not in d and 'floor plans' not in d, 'details add the range and sample, not the method: ' + d)
            ok(pg.query_selector('.kd-sec[data-cls] .kd-unc') is None, 'no unconfirmed row in the main list')
            ok('Estimates from past URA transactions, not current listings.' in pg.inner_text('.kd-g[data-sale=resale] .kd-gn'), 'resale said once to be past transactions')
            ok(no_overflow(pg), 'no sideways scroll'); shot(pg, vn + '-2bed-1.5m'); ok(not errs, str(errs)); ctx.close()
        t('$1.5m, 2 bedrooms, resale: confirmed 2-bedroom resales with Research\'s figures and the basis named', two_bed)
        def three_either():
            ctx, pg, errs = open_page(br, kw); form(pg, '2,000,000', beds=3)
            ok('New launches: from new-launch listings' in pg.inner_text('.kd-more'), pg.inner_text('.kd-more'))
            show(pg); h = H(pg); ok(re.match(MATCH, h) and '3 bedrooms' in CH(pg), h)
            c = pg.evaluate('__kd.res().counts'); ok(int(h.split()[0]) == c['projects'] and 'not confirmed' not in pg.inner_text('.kd-lead'), 'N is the confirmed count; nothing about the unconfirmed in the header')
            un = pg.query_selector('.kd-unconf'); ok(un is not None and not un.evaluate('e => e.open'), 'not-confirmed group, collapsed'); ok(str(c['insufficient']) in un.query_selector('summary').inner_text(), 'its count in its summary')
            un.query_selector('summary').click(); pg.wait_for_timeout(300); ut = un.inner_text()
            ok('Check the floor plan' in ut and 'Bedroom type not confirmed' in ut and '3BR size' not in ut, ut[:300])
            un.query_selector('.kd-rt').click(); pg.wait_for_timeout(300); ok(re.search(r'identified as 3-bedroom|don’t show bedrooms', un.inner_text()), 'details say what is identified')
            ok(pg.query_selector('.kd-unconf .kd-card.kd-unc') is not None, 'its cards look different (dashed)')
            ok(pg.evaluate("__kd.res().items.some(i => i.sale === 'new') ? !!document.querySelector('.kd-g h3') : true"), 'new launches still listed')
            uncl = pg.query_selector('.kd-uncl'); ok(uncl is None or 'Show any bedroom' in uncl.inner_text(), 'unclassified line offers Show any bedroom')
            meth = pg.evaluate("(() => { const d = document.querySelector('.kd-meth'); d.open = true; return d.innerText; })()")
            ok('URA rental records' in meth and 'left out' in meth, 'method names the basis and what was left out')
            ok(no_overflow(pg), 'no sideways scroll'); shot(pg, vn + '-3bed-2m-either'); ok(not errs, str(errs)); ctx.close()
        t('$2m, 3 bedrooms, new launch or resale: one list, not-confirmed apart, reasons in the method note', three_either)
        def place_beds():
            ctx, pg, errs = open_page(br, kw); form(pg, '2,000,000', sale='resale', beds=3, place='bishan mrt'); show(pg)
            ok('Bishan MRT' in pg.inner_text('.kd-chips') and '3 bedrooms' in pg.inner_text('.kd-chips'), pg.inner_text('.kd-chips'))
            ok(pg.evaluate("document.body.dataset.kdView") == 'stage', 'map is the stage')
            d = pg.evaluate("__kd.res().items.map(i => i.dist)"); ok(all(x <= 1000 for x in d) and d == sorted(d), 'within 1 km, nearest first: ' + str(d[:6]))
            ok(all(i['beds']['state'] == 'reliable' for i in pg.evaluate("__kd.res().items")), 'list is confirmed only')
            if d: ok(pg.query_selector('.kd-card .kd-rdist') is not None, 'distance shown')
            shot(pg, vn + '-3bed-bishan'); ok(not errs, str(errs)); ctx.close()
        t('location + bedrooms: 3 bedrooms within 1 km of Bishan MRT, on the map stage, nearest first', place_beds)
        def types():
            ctx, pg, errs = open_page(br, kw); form(pg, '1,800,000', sale='resale', beds=3, typ='ec'); show(pg)
            ok(all(i['cls'] == 'ec' for i in pg.evaluate("__kd.res().items")), 'EC only'); ok('Executive Condominiums' in pg.inner_text('.kd-sec[data-cls=ec]'), 'class named on its section')
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open'); pg.click('#kdEdit [data-f=seg][data-k=type][data-v=any]'); pg.wait_for_timeout(400)
            cls = pg.evaluate("[...document.querySelectorAll('.kd-sec[data-cls]')].map(s => s.dataset.cls)"); ok(len(cls) >= 2 and len(cls) == len(set(cls)), 'classes listed apart: ' + str(cls))
            ok(not errs, str(errs)); ctx.close()
        t('multiple property types: EC alone, then Any with condos, ECs and cluster housing listed apart', types)
        def any_bed():
            ctx, pg, errs = open_page(br, kw); form(pg, '2,000,000', sale='resale', beds=3); show(pg); n3 = pg.evaluate('__kd.res().counts.projects')
            b = pg.query_selector('.kd-uncl [data-f=alt][data-id=beds]'); ok(b is not None, 'Show any bedroom offered'); b.click(); pg.wait_for_timeout(500)
            ok('bedroom' not in pg.inner_text('.kd-chips'), 'bedrooms removed'); ok(re.match(MATCH, H(pg)), H(pg))
            ok(pg.evaluate('__kd.res().counts.projects') > n3, 'more developments without the bedroom count'); ok(pg.query_selector('.kd-unconf') is None); ok(not errs, str(errs)); ctx.close()
        t('unknown bedrooms: "Show any bedroom" removes the count and widens the list', any_bed)
        def none():
            ctx, pg, errs = open_page(br, kw); form(pg, '800,000', sale='resale', beds=4); show(pg)
            ok(H(pg) == 'No developments match your search' and '4+ bedrooms' in CH(pg) and 'Up to $0.8M' in CH(pg), H(pg) + ' | ' + CH(pg))
            e = pg.inner_text('.kd-empty'); ok('Show any bedroom' in e, e); ok(no_overflow(pg)); shot(pg, vn + '-none'); ok(not errs, str(errs)); ctx.close()
        t('no matching results: $800,000 and 4+ bedrooms says so and offers ways to widen', none)
        def edit_hist():
            ctx, pg, errs = open_page(br, kw); form(pg, '2,000,000', sale='resale', beds=3); show(pg); h3 = H(pg)
            pg.click('.kd-chip:has-text("3 bedrooms")'); pg.wait_for_selector('#kdEdit.open'); ok(pg.evaluate("document.querySelector('#kdEdit [data-more]').open"), 'the bed chip opens More requirements')
            pg.click('#kdEdit [data-f=seg][data-k=beds][data-v="2"]'); pg.wait_for_function("document.querySelector('.kd-chips').innerText.includes('2 bedrooms')", timeout=15000)
            ok('2 bedrooms' in pg.inner_text('.kd-chips') and 'Resale' in pg.inner_text('.kd-chips'), 'other requirements kept'); ok(pg.query_selector('.kd-entry') is None, 'never back to the entry screen')
            pg.click('#kdEdit [data-f=done]:visible >> nth=0'); pg.go_back(); pg.wait_for_selector('.kd-entry #kdBudget', timeout=15000)
            ok(pg.query_selector('[data-f=seg][data-k=beds][data-v="2"][aria-checked=true]') is not None, 'Back: the form keeps 2 bedrooms')
            ok(pg.query_selector('[data-f=seg][data-k=sale][data-v=resale][aria-checked=true]') is not None, 'Back: and resale')
            pg.go_forward(); pg.wait_for_selector('#kdH', timeout=15000); ok('2 bedrooms' in CH(pg), 'Forward: the 2-bedroom results again: ' + CH(pg))
            pg.reload(); pg.wait_for_selector('#kdH', timeout=25000); ok('2 bedrooms' in CH(pg), 'reload keeps them: ' + CH(pg)); ok(h3 != H(pg)); ok(not errs, str(errs)); ctx.close()
        t('editing: 3 to 2 bedrooms in place; Back is the form with every requirement, Forward and reload the same results', edit_hist)
        def to_research():
            ctx, pg, errs = open_page(br, kw); form(pg, '2,000,000', sale='resale', beds=3); show(pg)
            a = pg.query_selector('.kd-sec .kd-card a[data-bed]'); ok(a is not None, 'confirmed card links carry the type'); pid = a.get_attribute('data-id')
            if not a.is_visible(): pg.click(f'.kd-sec .kd-row[data-pid="{pid}"] .kd-rt'); pg.wait_for_timeout(200); a = pg.query_selector(f'.kd-sec .kd-card[data-pid="{pid}"] a[data-bed]')   # phone: the links are in the opened card (redrawn)
            a.click(); pg.wait_for_url(re.compile(r'research/#/p/'), timeout=15000); pg.wait_for_timeout(1500)
            ok(pg.evaluate("sessionStorage.getItem('kpt.research.bed')") == '3', 'Research opens on the 3-bedroom type')
            body = pg.inner_text('body'); ok(re.search(r'3[- ]bedroom', body, re.I), 'Research shows the 3-bedroom answer for ' + pid); ok(not errs, str(errs)); ctx.close()
        t('Research page link from a confirmed match opens that development on its 3-bedroom type', to_research)
        def fallback():
            ctx, pg, errs = open_page(br, kw, no_beds=True); form(pg, '2,000,000', beds=3); show(pg)
            ok(re.match(MATCH, H(pg)), 'plain headline: ' + H(pg)); ok(pg.query_selector('.kd-unconf') is None)
            pg.click('.kd-bar [data-f=edit]'); pg.wait_for_selector('#kdEdit.open'); pg.evaluate("document.querySelector('#kdEdit [data-more]').open = true")
            ok('resale bedroom matching isn’t available just now' in pg.inner_text('#kdEdit'), pg.inner_text('#kdEdit .kd-more'))
            pg.click('#kdEdit [data-f=seg][data-k=sale][data-v=resale]'); pg.wait_for_timeout(400)
            ok(pg.query_selector('#kdEdit [data-f=seg][data-k=beds][data-v="3"][disabled]') is not None, 'resale bedrooms off'); ok('3 bedrooms' not in pg.inner_text('.kd-chips'), 'and no bedroom chip that is not applied')
            ok(not [e for e in errs if 'find-beds' not in e], str(errs)); ctx.close()
        t('without find-beds.json the page behaves as before: bedrooms for new launches only, said plainly', fallback)
        def research_form():
            ctx, pg, errs = open_page(br, kw, path='research/', q='#/budget'); pg.wait_for_selector('#kdBudget', timeout=25000)
            form(pg, '1,600,000', sale='resale', beds=2); ok('URA rental records or floor plans' in pg.inner_text('.kd-more'), 'the hosted form offers resale bedrooms')
            pg.click('[data-f=show]'); pg.wait_for_url(re.compile(r'what-can-i-buy'), timeout=15000); pg.wait_for_selector('#kdH', timeout=25000)
            ok(re.match(MATCH, H(pg)) and '2 bedrooms' in CH(pg) and 'Up to $1.6M' in CH(pg) and 'Resale' in CH(pg), H(pg) + ' | ' + CH(pg)); ok(not errs, str(errs)); ctx.close()
        t('Research → What can this budget buy?: resale + 2 bedrooms opens the bedroom results', research_form)
    br.close()
finally:
    srv.kill()
print(f'\n{passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
