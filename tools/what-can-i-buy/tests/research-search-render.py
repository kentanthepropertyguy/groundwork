# python3 tools/what-can-i-buy/tests/research-search-render.py
# Research fix (Ken, 27 Oct 2026): Research -> "What can this budget buy?" and the Budget Search page, in a real browser, desktop and a 390px phone.
#  1. Loading: the new-launch listings load as soon as the form is shown (Research included), the bedroom control is usable while they load,
#     and it is brought up to date when they arrive (nothing typed or chosen is lost). Missing or stale listings switch it off, said plainly.
#  2. Source: new-launch results come only from the listings (bedroom types, listed sizes, indicative asking prices, the update date); URA developer
#     sales never make a new-launch match and stay on Research as price history. Resale is unchanged. Either keeps the two apart.
#  3. Saved search, Back/Forward, Edit search, Research and Map links still work.
# The listings file is served through the browser with its dates moved relative to now, so the suite never depends on the day it runs.
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

def inv_body(age_hours):
    at = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=age_hours)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    d = json.loads(json.dumps(INV)); d['checkedAt'] = at
    for p in d['projects']: p['checkedAt'] = at
    return json.dumps(d)
def open_page(br, kw, path, inv='fresh', hold=False):
    """inv: 'fresh' (12 hours old), 'stale' (22 days), 'missing' (404). hold: the listings answer waits until release() is called."""
    ctx = br.new_context(**kw); pg = ctx.new_page(); errs = []; held = []; hold = [hold]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'googletagmanager|facebook\.net|onemap\.gov\.sg'), lambda r: r.fulfill(status=200, content_type='application/javascript', body=''))
    def answer(r):
        if inv == 'missing': r.fulfill(status=404, body='')
        else: r.fulfill(status=200, content_type='application/json', body=inv_body(12 if inv == 'fresh' else 22 * 24))
    pg.route(re.compile(r'/data/projects/inventory\.json'), lambda r: held.append(r) if hold[0] else answer(r))
    def release():
        for _ in range(100):
            if held: break
            pg.wait_for_timeout(50)
        hold[0] = False   # held once: later loads (another page of the same visit) are answered at once
        while held: answer(held.pop())
    pg.goto(BASE + '/' + path); return ctx, pg, errs, release
def beds_state(pg, scope=''):
    blk = pg.query_selector(scope + ' [data-bedsblk]')
    return {'disabled': pg.eval_on_selector_all(scope + ' [data-bedsblk] button[disabled]', 'e=>e.length'), 'note': blk.text_content() if blk else '',
            'chosen': pg.eval_on_selector_all(scope + ' [data-bedsblk] [aria-checked=true]', 'e=>e.map(x=>x.dataset.v)')}
def open_more(pg, scope=''):   # as a buyer does: tap "More requirements" (the page then keeps it open across redraws)
    if not pg.evaluate(f"document.querySelector('{scope} [data-more]').open"): pg.click(f'{scope} [data-more] > summary >> visible=true')
def H(pg): return pg.inner_text('#kdH').replace('‑', '-')
def group(pg, name): return pg.query_selector('.kd-g[data-sale=%s]' % ('new' if name == 'New launch' else 'resale'))
def money(s): return float(s.replace('$', '').replace('M', '').replace('m', '')) * 1e6
# Results layout (Ken, 28 Oct 2026): one row per development, its asking price "from $1.90M"; the check date once per group; the listed types in the search result itself
def new_cards_ok(pg, budget, beds=None):
    gs = pg.query_selector_all('.kd-g[data-sale=new]'); ok(gs, 'a New launch group')
    for g in gs:
        note = g.query_selector('.kd-gn').inner_text(); ok(note.count('Developer listings · Checked') == 1 and 'Indicative asking prices' in note and 'Availability may have changed.' in note, 'check date once for the group, with the disclaimer: ' + note)
        rows = g.query_selector_all('.kd-row'); ok(rows, 'new-launch rows')
        for c in rows:
            txt = c.inner_text(); ok('(URA)' not in txt and 'Developer sales' not in txt and 'Developer listings · Checked' not in txt, 'no URA developer sales, no repeated date: ' + txt[:160])
            m = re.search(r'from (\$[\d.]+M)', c.query_selector('.kd-rp').inner_text()); ok(m, txt)
            ok(money(m.group(1)) <= budget + 5000, 'listed price within the maximum: ' + txt)
            ok(re.search(r'\d[\d,]*–[\d,]+ sq ft', c.query_selector('.kd-rs').inner_text()), 'listed sizes shown: ' + txt)
    its = pg.evaluate("__kd.res().items.filter(i => i.sale === 'new').map(i => ({ ura: i.ura, types: i.inv.types.map(t => t.bedrooms) }))")
    for it in its:
        ok(it['ura'] is None, 'no URA figure behind a new launch')
        if beds: ok(all(b == beds or (beds == 4 and b >= 4) for b in it['types']), 'only the chosen bedroom type: ' + str(it['types']))
    return gs
def clean_text(pg):
    b = pg.inner_text('#root'); ok(not re.search(r'huttons', b, re.I), 'no source name in the search or its results (Ken’s own credentials in the footer are not part of it)'); ok(not re.search(r'sold out', b, re.I), 'never "sold out"')
def no_overflow(pg): return not pg.evaluate('document.documentElement.scrollWidth>innerWidth+1')

VIEWS = [('desktop', dict(viewport={'width': 1440, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True))]
try:
  with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, kw in VIEWS:
        print(f'Research budget search, {vn}')
        def research_fresh():
            ctx, pg, errs, rel = open_page(br, kw, 'research/#/budget', hold=True)
            pg.wait_for_selector('#rwBudget .kd-form'); open_more(pg, '#rwBudget'); pg.click('#rwBudget [data-k=sale] [data-v=new]')
            s = beds_state(pg, '#rwBudget'); ok(s['disabled'] == 0 and 'loading' in s['note'], 'while the listings load the bedroom choice is offered, said to be loading: ' + str(s))
            pg.click('#rwBudget [data-k=beds] [data-v="2"]'); pg.fill('#rwBudget #kdBudget', '2,000,000')
            rel(); pg.wait_for_function("document.querySelector('#rwBudget [data-bedsblk]') && !/loading/.test(document.querySelector('#rwBudget [data-bedsblk]').innerText)", timeout=20000)
            s = beds_state(pg, '#rwBudget'); ok(s['disabled'] == 0 and s['chosen'] == ['2'] and 'Matched on new-launch listings' in s['note'], 'after loading: still 2 bedrooms, enabled: ' + str(s))
            ok(pg.input_value('#rwBudget #kdBudget') == '2,000,000', 'the budget typed during loading is kept')
            pg.click('#rwBudget [data-f=show]'); pg.wait_for_url(re.compile(r'what-can-i-buy')); pg.wait_for_selector('.kd-card', timeout=20000)
            ok(re.match(r'^\d+ developments? match(es)? your search$', H(pg)) and '2 bedrooms' in pg.inner_text('.kd-chips') and 'New launch' in pg.inner_text('.kd-chips'), H(pg))
            ok(group(pg, 'Resale') is None, 'New launch only: no resale group'); new_cards_ok(pg, 2000000, 2)
            ok('past' not in pg.inner_text('.kd-lead'), 'no blanket past-sales line: ' + pg.inner_text('.kd-lead'))
            clean_text(pg); ok(no_overflow(pg), 'no sideways scroll'); ok(not errs, str(errs)); ctx.close()
        t('Research, fresh entry (before: bedrooms off, the listings never loaded): listings load at once, a choice made while loading is kept, 2-bedroom new launches from listings', research_fresh)
        def research_loaded():
            ctx, pg, errs, rel = open_page(br, kw, 'research/#/budget')
            pg.wait_for_selector('#rwBudget .kd-form'); pg.wait_for_function("document.querySelector('#rwBudget [data-bedsblk]') && !/loading/.test(document.querySelector('#rwBudget [data-bedsblk]').innerText)", timeout=20000)
            open_more(pg, '#rwBudget'); pg.click('#rwBudget [data-k=sale] [data-v=new]'); s = beds_state(pg, '#rwBudget')
            ok(s['disabled'] == 0 and 'aren’t available' not in s['note'], 'New launch: bedroom choice on: ' + str(s)); ctx.close()
        t('Research, fresh entry with the listings loaded: New launch keeps the bedroom choice on', research_loaded)
        def direct_delay():
            ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/', hold=True)
            pg.wait_for_selector('#kdBudget'); open_more(pg); pg.click('[data-k=sale] [data-v=new]'); pg.click('[data-k=beds] [data-v="3"]')
            ok(beds_state(pg)['chosen'] == ['3'], 'chosen while loading')
            rel(); pg.wait_for_function("!/loading/.test(document.querySelector('[data-bedsblk]').innerText)", timeout=20000)
            s = beds_state(pg); ok(s['disabled'] == 0 and s['chosen'] == ['3'], str(s))
            pg.fill('#kdBudget', '3,000,000'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000); new_cards_ok(pg, 3000000, 3)
            ok(not errs, str(errs)); ctx.close()
        t('Budget Search page, direct entry, listings delayed: a 3-bedroom choice made while loading is kept and applied', direct_delay)
        def missing(kind):
            def run():
                ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/', inv=kind)
                pg.wait_for_selector('#kdBudget'); pg.wait_for_function("!/loading/.test(document.querySelector('[data-bedsblk]').innerText)", timeout=20000)
                open_more(pg); pg.click('[data-k=sale] [data-v=new]'); s = beds_state(pg)
                ok(s['disabled'] == 4 and 'aren’t available right now' in s['note'], 'bedrooms off, said plainly: ' + str(s))
                pg.fill('#kdBudget', '2,000,000'); pg.click('[data-f=show]'); pg.wait_for_selector('#kdH', timeout=20000)
                ok(H(pg) == 'Developer listings couldn’t be loaded just now', H(pg)); ok(pg.query_selector('.kd-card') is None, 'no new launch from URA developer sales instead')
                ok('Past developer sales are on each development’s Research page' in pg.inner_text('.kd-invgone'))
                pg.click('.kd-bar [data-f=edit]'); pg.click('#kdEdit [data-k=sale] [data-v=either]'); pg.wait_for_timeout(300)
                ok(group(pg, 'New launch') is None and group(pg, 'Resale') is not None, 'Either: resale only'); ok('so only resale is shown' in pg.inner_text('.kd-invgone'))
                clean_text(pg); ok(not errs, str(errs)); ctx.close()
            return run
        t('listings missing (404): New launch lists nothing rather than old developer prices; Either shows resale, said plainly', missing('missing'))
        t('listings stale (22 days, past the 21-day window): the same as missing', missing('stale'))
        def switching():
            ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/')
            pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000)
            ok(re.match(r'^\d+ developments match your search$', H(pg)), H(pg))
            rg, ng = group(pg, 'Resale'), group(pg, 'New launch'); ok(rg and ng, 'both groups')
            ok('Estimates from past URA transactions, not current listings.' in rg.query_selector('.kd-gn').inner_text(), 'resale labelled once as past transactions')
            ok('Developer listings · Checked' in ng.inner_text(), 'new launches labelled as listings'); ok(pg.evaluate("__kd.res().items.filter(i => i.sale === 'resale').every(i => i.ura && !i.inv)"), 'resale evidence from URA')
            new_cards_ok(pg, 2000000)
            for v, want in (('new', ('New launch',)), ('resale', ('Resale',)), ('either', ('Resale', 'New launch'))):
                pg.click('.kd-bar [data-f=edit]'); pg.click(f'#kdEdit [data-k=sale] [data-v={v}]'); pg.wait_for_timeout(300); pg.click('#kdEdit [data-f=done] >> visible=true')
                names = pg.eval_on_selector_all('.kd-g', 'e=>[...new Set(e.map(x=>x.dataset.sale === "new" ? "New launch" : "Resale"))]'); ok(sorted(names) == sorted(want), v + ': ' + str(names))
                if v == 'resale': ok('Estimates from past URA transactions' in pg.inner_text('.kd-g[data-sale=resale] .kd-gn'), 'resale keeps its past-transactions line')
            clean_text(pg); ok(no_overflow(pg), 'no sideways scroll'); ok(not errs, str(errs)); ctx.close()
        t('Either at $2m: resale from URA resales and new launches from listings, labelled apart; switching New launch / Resale / Either', switching)
        def budgets():
            for b in ('1,500,000', '3,000,000'):
                ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/')
                pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', b); pg.click('[data-k=sale] [data-v=new]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000)
                new_cards_ok(pg, float(b.replace(',', ''))); ok(not errs, str(errs)); ctx.close()
        t('budgets $1.5m and $3m: every listed price shown is within the maximum', budgets)
        def bed_combos():
            ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/')
            pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,500,000'); pg.click('[data-k=sale] [data-v=new]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000)
            for b in ('1', '2', '3', '4', ''):
                pg.click('.kd-bar [data-f=edit]'); open_more(pg, '#kdEdit'); pg.click(f'#kdEdit [data-k=beds] [data-v="{b}"]'); pg.wait_for_timeout(300); pg.click('#kdEdit [data-f=done] >> visible=true')
                if pg.query_selector('.kd-card'): new_cards_ok(pg, 2500000, int(b) if b else None)
                else: ok(H(pg) == 'No developments match your search', H(pg))
            ok(not errs, str(errs)); ctx.close()
        t('bedroom combinations 1, 2, 3, 4+ and Any on new launches: only listed types of that count', bed_combos)
        def saved():
            ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/')
            pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('[data-k=sale] [data-v=new]'); open_more(pg); pg.click('[data-k=beds] [data-v="2"]')
            pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000); h1 = H(pg)
            pg.reload(); pg.wait_for_selector('.kd-card', timeout=20000); ok(H(pg) == h1, 'reload: the saved search opens on the same results')
            pg.go_back(); pg.wait_for_selector('.kd-go', timeout=20000); s = beds_state(pg)
            ok(s['chosen'] == ['2'] and s['disabled'] == 0, 'Back: the form with 2 bedrooms still chosen and on: ' + str(s))
            pg.go_forward(); pg.wait_for_selector('.kd-card', timeout=20000); ok(H(pg) == h1, 'Forward: the results again')
            pg2 = pg; pg2.goto(BASE + '/research/#/budget'); pg2.wait_for_selector('#rwBudget .kd-form')   # the same tab: the search is remembered for this tab only
            pg2.wait_for_function("!/loading/.test(document.querySelector('#rwBudget [data-bedsblk]').innerText)", timeout=20000); open_more(pg2, '#rwBudget')
            s = beds_state(pg2, '#rwBudget'); ok(pg2.input_value('#rwBudget #kdBudget') == '2,000,000' and s['chosen'] == ['2'] and s['disabled'] == 0, 'Research form opens prefilled from the saved search, bedrooms on: ' + str(s))
            ok(not errs, str(errs)); ctx.close()
        t('saved search: reload, Back to the form (bedrooms kept and on), Forward, and the Research form prefilled', saved)
        def links():
            ctx, pg, errs, rel = open_page(br, kw, 'tools/what-can-i-buy/')
            pg.wait_for_selector('#kdBudget'); pg.fill('#kdBudget', '2,000,000'); pg.click('[data-k=sale] [data-v=new]'); pg.click('[data-f=show]'); pg.wait_for_selector('.kd-card', timeout=20000)
            a = pg.query_selector('.kd-card a[href$="/new"]:text-is("Research")'); ok(a, 'a Research link (past developer sales) on a new launch that has them')
            if not a.is_visible(): pid = a.get_attribute('data-id'); pg.click(f'.kd-row[data-pid="{pid}"] .kd-rt'); pg.wait_for_timeout(200); a = pg.query_selector(f'.kd-row[data-pid="{pid}"] a[href$="/new"]')   # phone: in the opened card
            href = a.get_attribute('href'); ok(re.search(r'research/#/p/[a-z0-9-]+/new$', href), href)
            mp = pg.query_selector('.kd-card a:text-is("Map")').get_attribute('href'); ok(re.search(r'research/map/#p=[a-z0-9-]+$', mp), mp)
            a.click(); pg.wait_for_url(re.compile(r'research/#/p/')); pg.wait_for_function("/new sales/i.test(document.body.innerText) && /Transactions/.test(document.body.innerText)", timeout=30000)   # Research: the development's developer (new) sales and every transaction
            pg.goto(BASE + '/research/map/' + mp.split('research/map/')[1]); pg.wait_for_selector('.leaflet-container', timeout=30000)
            ok(not errs, str(errs)); ctx.close()
        t('Research and Map links: past developer sales open on Research; View on Map opens the Map', links)
    br.close()
finally:
    srv.terminate()
print(f'\nresearch-search-render: {passed} passed, {failed} failed')
raise SystemExit(1 if failed else 0)
